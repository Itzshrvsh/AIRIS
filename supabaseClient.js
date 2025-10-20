// supabaseClient.js
const { createClient } = require("@supabase/supabase-js");

const supabaseUrl = "https://mvcytlmuuiklxhgvzitf.supabase.co";
const supabaseKey = "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6Im12Y3l0bG11dWlrbHhoZ3Z6aXRmIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NjA3NzEwODYsImV4cCI6MjA3NjM0NzA4Nn0.Gv_v_RkSQAFuOlhiCRKEhkzYE375FQ21bYGsCxX9PiE";
const supabase = createClient(supabaseUrl, supabaseKey);

module.exports = { supabase };
