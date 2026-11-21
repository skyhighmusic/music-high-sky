import { defineConfig } from 'drizzle-kit';

export default defineConfig({
  schema: './src/db/schema.ts',
  out: './drizzle',
  dialect: 'postgresql',
  dbCredentials: {
    host: process.env.SQL_HOST || '127.0.0.1',
    port: 5432,
    user: process.env.SQL_ADMIN_USER || 'postgres',
    password: process.env.SQL_ADMIN_PASSWORD || '',
    database: process.env.SQL_DB_NAME || 'postgres',
    ssl: false,
  },
});
