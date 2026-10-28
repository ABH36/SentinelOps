import { DataSource, DataSourceOptions } from 'typeorm';
import { databaseConfig } from '../config/database.config';

const options = {
  ...databaseConfig(),
  migrations: ['src/database/migrations/*.ts'],
  entities: ['src/database/entities/*.ts'],
} as DataSourceOptions;

export const AppDataSource = new DataSource(options);
