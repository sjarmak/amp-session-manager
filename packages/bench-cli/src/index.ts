#!/usr/bin/env node

import { Command } from 'commander'
import chalk from 'chalk'
import { join } from 'node:path'
import { existsSync } from 'node:fs'

import { BenchmarkRunner, BenchmarkRunnerConfig } from '@ampsm/bench-core'

// Try to detect local amp CLI and settings
function detectAmpSettings() {
  const possibleCliPaths = [
    join(process.cwd(), '../amp/cli/dist/main.js'),
    join(process.cwd(), '../../amp/cli/dist/main.js'),
    join(process.env.HOME || '', 'amp/cli/dist/main.js'),
  ]
  
  for (const cliPath of possibleCliPaths) {
    if (existsSync(cliPath)) {
      return {
        mode: 'local-cli' as const,
        localCliPath: cliPath,
      }
    }
  }
  
  return undefined
}

const program = new Command()

program
  .name('amp-bench')
  .description('Unified benchmark CLI for Amp Session Orchestrator')
  .version('1.0.0')

program
  .command('run')
  .description('Run a benchmark specification')
  .argument('<spec-file>', 'Path to benchmark YAML specification')
  .option('-m, --models <models...>', 'Models to run (default: all in spec)')
  .option('-p, --parallel <number>', 'Number of parallel executions', '1')
  .option('-o, --output <dir>', 'Output directory for results', './benchmark-results')
  .option('--working-dir <dir>', 'Working directory for benchmark execution', process.cwd())
  .option('--dry-run', 'Show what would be executed without running')
  .option('--formats <formats...>', 'Report formats to generate', ['json', 'markdown'])
  .option('--verbose', 'Verbose logging')
  .action(async (specFile: string, options: any) => {
    try {
      // Validate spec file exists
      const specPath = specFile.startsWith('/') ? specFile : join(process.cwd(), specFile)
      if (!existsSync(specPath)) {
        console.error(chalk.red(`Benchmark spec file not found: ${specFile}`))
        process.exit(1)
      }

      // Detect amp settings for local CLI usage
      const ampSettings = detectAmpSettings()
      if (ampSettings) {
        console.log(chalk.blue(`🔧 Using local Amp CLI: ${ampSettings.localCliPath}`))
      }

      // Parse options
      const config: BenchmarkRunnerConfig = {
        workingDir: options.workingDir,
        outputDir: options.output,
        parallel: parseInt(options.parallel, 10),
        models: options.models,
        dryRun: options.dryRun,
        reportFormats: options.formats,
        ampSettings
      }

      console.log(chalk.blue(`🚀 Starting benchmark: ${specFile}`))
      if (config.dryRun) {
        console.log(chalk.yellow('📋 DRY RUN MODE - No actual execution'))
      }

      // Create runner and setup event listeners
      const runner = new BenchmarkRunner(config)

      runner.on('benchmark_started', (data) => {
        console.log(chalk.green(`📊 Benchmark started: ${data.name}`))
        console.log(`   Models: ${data.models.join(', ')}`)
        console.log(`   Total cases: ${data.total_cases}`)
        console.log(`   Parallel: ${config.parallel}`)
        console.log()
      })

      runner.on('case_started', (event) => {
        if (options.verbose) {
          console.log(chalk.cyan(`▶️  Starting: ${event.caseId} (${event.model})`))
        }
      })

      runner.on('case_completed', (event) => {
        const result = event.data
        const status = result.passed ? chalk.green('✅') : chalk.red('❌')
        const duration = chalk.gray(`${result.duration.toFixed(1)}s`)
        
        console.log(`${status} ${event.caseId} (${event.model}) ${duration}`)
      })

      runner.on('case_failed', (event) => {
        console.log(chalk.red(`❌ FAILED: ${event.caseId} (${event.model})`))
        if (options.verbose && event.data?.error) {
          console.log(chalk.red(`   Error: ${event.data.error}`))
        }
      })

      runner.on('reports_generated', (data) => {
        console.log()
        console.log(chalk.green('📈 Reports generated:'))
        for (const format of data.formats) {
          console.log(`   ${format.toUpperCase()}: ${data.outputDir}`)
        }
      })

      // Run the benchmark
      const result = await runner.runBenchmark(specPath)

      // Print final summary
      console.log()
      console.log(chalk.bold('🏁 Benchmark Complete'))
      console.log(`   Duration: ${Math.round(result.total_duration_sec)}s`)
      console.log(`   Success Rate: ${(result.summary.success_rate * 100).toFixed(1)}%`)
      console.log(`   Cases: ${result.summary.passed_cases}/${result.summary.total_cases} passed`)
      
      // Model breakdown
      console.log()
      console.log(chalk.bold('📊 Model Results:'))
      for (const [model, summary] of Object.entries(result.summary.by_model)) {
        const rate = (summary.success_rate * 100).toFixed(1)
        const rateColor = summary.success_rate > 0.8 ? chalk.green : summary.success_rate > 0.5 ? chalk.yellow : chalk.red
        console.log(`   ${model}: ${rateColor(rate + '%')} (${summary.passed_cases}/${summary.total_cases})`)
      }

      // Exit with error code if any cases failed
      const exitCode = result.summary.success_rate === 1.0 ? 0 : 1
      process.exit(exitCode)

    } catch (error) {
      console.error(chalk.red('❌ Benchmark failed:'))
      console.error(chalk.red(error instanceof Error ? error.message : String(error)))
      
      if (options.verbose && error instanceof Error && error.stack) {
        console.error(chalk.gray(error.stack))
      }
      
      process.exit(1)
    }
  })

program
  .command('validate')
  .description('Validate a benchmark specification file')
  .argument('<spec-file>', 'Path to benchmark YAML specification')
  .action(async (specFile: string) => {
    try {
      const specPath = specFile.startsWith('/') ? specFile : join(process.cwd(), specFile)
      
      if (!existsSync(specPath)) {
        console.error(chalk.red(`Benchmark spec file not found: ${specFile}`))
        process.exit(1)
      }

      // Just try to create a runner to validate the spec
      const runner = new BenchmarkRunner({ dryRun: true })
      
      console.log(chalk.blue(`🔍 Validating benchmark spec: ${specFile}`))
      
      // This will parse and validate the spec
      await runner.runBenchmark(specPath)
      
      console.log(chalk.green('✅ Benchmark specification is valid'))
      
    } catch (error) {
      console.error(chalk.red('❌ Validation failed:'))
      console.error(chalk.red(error instanceof Error ? error.message : String(error)))
      process.exit(1)
    }
  })

program
  .command('list-models')
  .description('List available models in a benchmark specification')
  .argument('<spec-file>', 'Path to benchmark YAML specification')
  .action(async (specFile: string) => {
    try {
      const { readFileSync } = await import('node:fs')
      const { parse } = await import('yaml')
      
      const specPath = specFile.startsWith('/') ? specFile : join(process.cwd(), specFile)
      
      if (!existsSync(specPath)) {
        console.error(chalk.red(`Benchmark spec file not found: ${specFile}`))
        process.exit(1)
      }

      const content = readFileSync(specPath, 'utf-8')
      const spec = parse(content)
      
      console.log(chalk.blue(`Models defined in ${specFile}:`))
      for (const [name, config] of Object.entries(spec.models || {})) {
        console.log(`  ${name}: ${(config as any).name || name}`)
        if ((config as any).amp_args) {
          console.log(chalk.gray(`    args: ${(config as any).amp_args.join(' ')}`))
        }
      }
      
    } catch (error) {
      console.error(chalk.red('❌ Failed to read spec:'))
      console.error(chalk.red(error instanceof Error ? error.message : String(error)))
      process.exit(1)
    }
  })

// Handle unhandled promise rejections
process.on('unhandledRejection', (error) => {
  console.error(chalk.red('❌ Unhandled error:'))
  console.error(error)
  process.exit(1)
})

// Handle SIGINT (Ctrl+C) gracefully
process.on('SIGINT', () => {
  console.log(chalk.yellow('\n🛑 Benchmark interrupted by user'))
  process.exit(130)
})

program.parse()
