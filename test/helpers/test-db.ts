import { MongoMemoryServer } from 'mongodb-memory-server';

let memoryServer: MongoMemoryServer | undefined;

export const adminHeaders = { authorization: 'Bearer test-admin-token' };

export async function startTestDb(): Promise<void> {
  memoryServer = await MongoMemoryServer.create();
  process.env.MONGODB_URI = memoryServer.getUri('blarescape_test');
  process.env.MONGODB_DATABASE = 'blarescape_test';
  process.env.ADMIN_API_TOKEN = 'test-admin-token';
}

export async function stopTestDb(): Promise<void> {
  await memoryServer?.stop();
  memoryServer = undefined;
  delete process.env.MONGODB_URI;
  delete process.env.MONGODB_DATABASE;
  delete process.env.ADMIN_API_TOKEN;
}
