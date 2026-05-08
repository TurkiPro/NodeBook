-- Enable real-time change events for the graphs table.
-- Run this once in the Supabase SQL Editor (or apply via supabase db push).

-- Full row data is required so the subscription payload includes old + new values.
ALTER TABLE graphs REPLICA IDENTITY FULL;

-- Add the table to the supabase_realtime publication so change events are broadcast.
ALTER PUBLICATION supabase_realtime ADD TABLE graphs;
