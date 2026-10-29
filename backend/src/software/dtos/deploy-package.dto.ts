import { IsString, IsEnum, IsOptional, IsArray, IsObject, IsNumber, IsDateString } from 'class-validator';
import { DeploymentPriority } from '../../database/entities/software-deployment.entity';

export class DeployPackageDto {
  @IsString()
  packageId: string;

  @IsOptional()
  @IsString()
  deviceId?: string;

  @IsOptional()
  @IsArray()
  @IsString({ each: true })
  deviceIds?: string[];

  @IsOptional()
  @IsEnum(DeploymentPriority)
  priority?: DeploymentPriority;

  @IsOptional()
  @IsDateString()
  scheduledAt?: string;

  @IsOptional()
  @IsNumber()
  maxRetries?: number;

  @IsOptional()
  @IsObject()
  overrideSettings?: Record<string, any>;

  @IsOptional()
  @IsObject()
  metadata?: Record<string, any>;
}

export class UninstallPackageDto {
  @IsString()
  packageId: string;

  @IsOptional()
  @IsString()
  deviceId?: string;

  @IsOptional()
  @IsArray()
  @IsString({ each: true })
  deviceIds?: string[];

  @IsOptional()
  @IsEnum(DeploymentPriority)
  priority?: DeploymentPriority;

  @IsOptional()
  @IsObject()
  metadata?: Record<string, any>;
}
