// supabaseClient.js
//
// ⚠️ SECURITY: this file used to contain a hard-coded Supabase anon key
// committed to the repository. Credentials now come exclusively from the
// local .env file (SUPABASE_URL / SUPABASE_KEY) via dotenv, which is
// already loaded by index.js before this module resolves.
//
// If you are seeing "missing SUPABASE_URL": create/restore .env locally
//     SUPABASE_URL=https://<project>.supabase.co
//     SUPABASE_KEY=<anon-key>
// and rotate the old key (see SECURITY notes in the migration report).

const { createClient } = require("@supabase/supabase-js");

require("dotenv").config({ path: require("path").join(__dirname, ".env") });

const supabaseUrl = process.env.SUPABASE_URL;
const supabaseKey = process.env.SUPABASE_KEY;

let supabase = null;
if (supabaseUrl && supabaseKey) {
  supabase = createClient(supabaseUrl, supabaseKey);
} else {
  console.warn("[supabaseClient] SUPABASE_URL/SUPABASE_KEY missing from .env — Supabase features are disabled.");
}

module.exports = { supabase, supabaseUrl, supabaseKey };
