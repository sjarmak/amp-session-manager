import { AmpServer } from '@ampsm/server';

export async function serverCommand(options: {
  host?: string;
  port?: number;
  cors?: boolean;
}): Promise<void> {
  const host = options.host || '0.0.0.0'; // Default to all interfaces for remote access
  const port = options.port || 7760;
  
  console.log(`🚀 Starting Amp Session Manager server on ${host}:${port}`);
  console.log('📱 Remote access enabled - use SSH tunneling for secure connections');
  
  const server = new AmpServer({ host, port, cors: options.cors });
  
  try {
    await server.start({ host, port });
    console.log(`✅ Server running at http://${host}:${port}`);
    console.log('🔑 Check the server logs above for the authentication token');
    console.log('\n📖 SSH Tunnel Example:');
    console.log(`   ssh -L 7760:localhost:7760 user@remote-machine`);
    console.log('   Then access http://localhost:7760 in your local browser');
    
    // Keep process alive
    process.on('SIGINT', async () => {
      console.log('\n🛑 Shutting down server...');
      await server.stop();
      process.exit(0);
    });
    
    // Keep alive
    await new Promise(() => {});
    
  } catch (error) {
    console.error('❌ Failed to start server:', error);
    process.exit(1);
  }
}
