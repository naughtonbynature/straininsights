/**
 * Supabase client for reading POS lab results from HeadyOS.
 */
import { createClient } from "@supabase/supabase-js";

const SUPABASE_URL = process.env.SUPABASE_URL || "https://qeuxpcbntsskdwufmrsr.supabase.co";
const SUPABASE_SERVICE_ROLE_KEY = "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InFldXhwY2JudHNza2R3dWZtcnNyIiwicm9sZSI6InNlcnZpY2Vfcm9sZSIsImlhdCI6MTc3NDk3Nzk4MywiZXhwIjoyMDkwNTUzOTgzfQ.6tU0hL5UPojhUbCLb1I7stB4MiN_N2Jjl7S5IwibFrg";
const SUPABASE_KEY = process.env.SUPABASE_SERVICE_KEY || SUPABASE_SERVICE_ROLE_KEY;

export const supabase = createClient(SUPABASE_URL, SUPABASE_KEY, {
  auth: { persistSession: false, autoRefreshToken: false },
});
