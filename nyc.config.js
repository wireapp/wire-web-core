module.exports = {
  all: true,
  'check-coverage': true,
  exclude: ['**/*.d.ts', '**/*.test*.ts', '**/index.ts'],
  extension: ['.ts'],
  include: ['src/**/*.ts'],
  lines: 0,
  'per-file': false,
  reporter: ['html', 'text-summary'],
  require: ['ts-node/register'],
};
