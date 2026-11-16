import { bigint, boolean, datetime, varchar } from "drizzle-orm/mysql-core";
import { sql } from "drizzle-orm";

/** Auto-increment unsigned BIGINT primary key (number mode is safe below 2^53). */
export const id = () => bigint("id", { mode: "number", unsigned: true }).autoincrement().primaryKey();
/** Unsigned BIGINT foreign-key column. */
export const fk = (name: string) => bigint(name, { mode: "number", unsigned: true });
/** Better Auth user id column. */
export const userIdCol = (name = "user_id") => varchar(name, { length: 36 });

export const createdAt = () =>
  datetime("created_at", { fsp: 3 }).notNull().default(sql`CURRENT_TIMESTAMP(3)`);
export const updatedAt = () =>
  datetime("updated_at", { fsp: 3 })
    .notNull()
    .default(sql`CURRENT_TIMESTAMP(3)`)
    .$onUpdate(() => new Date());
export const isMock = () => boolean("is_mock").notNull().default(false);
export const dt = (name: string) => datetime(name, { fsp: 3 });
