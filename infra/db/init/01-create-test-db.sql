-- Runs once, when the data volume is first created.
-- Integration tests use their own database so they can truncate freely.
CREATE DATABASE streeteats_test OWNER streeteats;
