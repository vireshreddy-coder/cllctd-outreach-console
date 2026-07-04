import fs from 'node:fs';
import path from 'node:path';
import { parse } from 'csv-parse/sync';
import { createClient } from '@supabase/supabase-js';

const url = process.env.SUPABASE_URL;
const key = process.env.SUPABASE_SERVICE_ROLE_KEY;

if (!url || !key) {
  throw new Error('Missing SUPABASE_URL or SUPABASE_SERVICE_ROLE_KEY');
}

const filePath = process.argv[2] || path.join(process.cwd(), 'data/seed_leads_physical_ai.csv');
const csv = fs.readFileSync(filePath, 'utf8');
const records = parse(csv, { columns: true, skip_empty_lines: true });

const supabase = createClient(url, key, { auth: { persistSession: false } });

const rows = records.map((row: any) => ({
  name: row.name,
  email: row.email || null,
  website_url: row.website_url || null,
  contact_url: row.contact_url || null,
  category: row.category,
  segment: row.category,
  priority: row.priority || 'MEDIUM',
  status: 'new',
  context: row.context,
  notes: row.notes,
  buyer_angle: row.context,
  asset_to_pitch: row.asset_to_pitch,
  sender: row.sender || 'viresh',
  source: 'physical_ai_seed',
  source_url: row.source_url || row.website_url || null,
  fit_score: row.priority === 'HIGH' ? 5 : row.priority === 'MEDIUM' ? 3 : 2,
}));

const { error } = await supabase.from('targets').upsert(rows, {
  onConflict: 'name,website_url',
  ignoreDuplicates: false,
});

if (error) throw error;
console.log(`Imported ${rows.length} leads`);
