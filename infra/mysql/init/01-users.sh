#!/bin/sh
# Least-privilege users (DATA_MODEL §7): the app gets DML only; migrations use a separate DDL user.
set -eu
mysql -uroot -p"$MYSQL_ROOT_PASSWORD" <<SQL
CREATE USER IF NOT EXISTS 'atlas_app'@'%' IDENTIFIED BY '${MYSQL_APP_PASSWORD}';
CREATE USER IF NOT EXISTS 'atlas_migrate'@'%' IDENTIFIED BY '${MYSQL_MIGRATE_PASSWORD}';
GRANT SELECT, INSERT, UPDATE, DELETE ON \`${MYSQL_DATABASE}\`.* TO 'atlas_app'@'%';
GRANT ALL PRIVILEGES ON \`${MYSQL_DATABASE}\`.* TO 'atlas_migrate'@'%';
FLUSH PRIVILEGES;
SQL
