-- Drizzle has no MySQL FULLTEXT builder. Requires innodb_ft_min_token_size=2 (infra/mysql/my.cnf) so "KV"/"TP" are indexed.
ALTER TABLE `papers` ADD FULLTEXT INDEX `papers_fulltext_idx` (`title`, `abstract`, `user_notes`);
