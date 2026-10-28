import { MigrationInterface, QueryRunner, TableColumn } from 'typeorm';

export class AddIsAutoToRemoteActions20261028115659 implements MigrationInterface {
  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.addColumn(
      'remote_actions',
      new TableColumn({
        name: 'isAuto',
        type: 'boolean',
        default: false,
        comment: 'Flag for automated system-initiated actions (auto-remediation)',
      }),
    );
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.dropColumn('remote_actions', 'isAuto');
  }
}
