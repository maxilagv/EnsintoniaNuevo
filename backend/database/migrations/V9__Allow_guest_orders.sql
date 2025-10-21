-- V9: Allow guest orders by making Orders.user_id nullable

ALTER TABLE Orders ALTER COLUMN user_id DROP NOT NULL;

