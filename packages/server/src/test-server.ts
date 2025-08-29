#!/usr/bin/env node
import Fastify from 'fastify';

async function testServer() {
  console.log('Creating minimal Fastify server...');
  
  const app = Fastify({ logger: false });
  
  app.get('/health', async () => ({ status: 'ok' }));
  
  console.log('Attempting to listen on 127.0.0.1:7760...');
  
  try {
    await app.listen({ host: '127.0.0.1', port: 7760 });
    console.log('✅ Server started successfully on 127.0.0.1:7760');
  } catch (error) {
    console.error('❌ Server failed to start:', error);
  }
}

testServer();
