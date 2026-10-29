import { IsString, IsEnum, IsOptional, IsObject, IsNumber, IsBoolean, IsArray, ValidateNested } from 'class-validator';
import { Type } from 'class-transformer';
import { PackageType, PackagePlatform, PackageStatus } from '../../database/entities/software-package.entity';

class PackageMetadataDto {
  @IsOptional()
  @IsString()
  fileUrl?: string;

  @IsOptional()
  @IsNumber()
  fileSize?: number;

  @IsOptional()
  @IsString()
  fileHash?: string;

  @IsOptional()
  @IsString()
  installCommand?: string;

  @IsOptional()
  @IsString()
  uninstallCommand?: string;

  @IsOptional()
  @IsArray()
  @IsString({ each: true })
  prerequisites?: string[];

  @IsOptional()
  @IsArray()
  @IsString({ each: true })
  dependencies?: string[];

  @IsOptional()
  @IsNumber()
  installTimeEstimate?: number;

  @IsOptional()
  @IsBoolean()
  requiresReboot?: boolean;

  @IsOptional()
  @IsBoolean()
  silentInstall?: boolean;

  @IsOptional()
  @IsObject()
  parameters?: Record<string, any>;
}

class PackageCompatibilityDto {
  @IsOptional()
  @IsString()
  minOsVersion?: string;

  @IsOptional()
  @IsString()
  maxOsVersion?: string;

  @IsOptional()
  @IsNumber()
  requiredRam?: number;

  @IsOptional()
  @IsNumber()
  requiredDiskSpace?: number;

  @IsOptional()
  @IsArray()
  @IsString({ each: true })
  supportedArchitectures?: string[];
}

export class CreatePackageDto {
  @IsString()
  name: string;

  @IsString()
  version: string;

  @IsOptional()
  @IsString()
  description?: string;

  @IsEnum(PackageType)
  packageType: PackageType;

  @IsEnum(PackagePlatform)
  platform: PackagePlatform;

  @IsOptional()
  @IsEnum(PackageStatus)
  status?: PackageStatus;

  @IsOptional()
  @IsString()
  publisher?: string;

  @ValidateNested()
  @Type(() => PackageMetadataDto)
  metadata: PackageMetadataDto;

  @IsOptional()
  @ValidateNested()
  @Type(() => PackageCompatibilityDto)
  compatibility?: PackageCompatibilityDto;

  @IsOptional()
  @IsString()
  effectiveFrom?: string;

  @IsOptional()
  @IsString()
  effectiveUntil?: string;
}
