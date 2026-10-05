const dotenv = require("dotenv");
const path = require("path");
const { createClient } = require("@supabase/supabase-js");

dotenv.config({ path: path.join(__dirname, ".env") });

const supabaseUrl = process.env.SUPABASE_URL;
const supabaseKey = process.env.SUPABASE_PUBLISHABLE_KEY || process.env.SUPABASE_ANON_KEY;

function createFallbackSupabaseClient() {
    const emptyResult = {
        data: [],
        error: null
    };

    return {
        from() {
            return {
                select() {
                    return {
                        order() {
                            return Promise.resolve(emptyResult);
                        }
                    };
                },
                insert() {
                    return {
                        select() {
                            return {
                                single() {
                                    return Promise.resolve({
                                        data: null,
                                        error: {
                                            message: "Supabase is not configured. Add SUPABASE_URL and SUPABASE_PUBLISHABLE_KEY to backend/.env."
                                        }
                                    });
                                }
                            };
                        }
                    };
                }
            };
        }
    };
}

const supabase = (supabaseUrl && supabaseKey)
    ? createClient(supabaseUrl, supabaseKey)
    : createFallbackSupabaseClient();

module.exports = supabase;