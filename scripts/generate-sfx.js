// Generate game SFX from text prompts via fal.ai's ElevenLabs sound-effects model.
//
// Usage:
//   FAL_KEY=xxxx npm run sfx           # generates only missing files
//   FAL_KEY=xxxx npm run sfx:force     # re-generates everything
//
// Costs are ~$0.002/sec — the full set below is well under $1.

import { fal } from '@fal-ai/client';
import { mkdir, writeFile, access } from 'node:fs/promises';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = dirname(fileURLToPath(import.meta.url));
// Vite serves /public at the site root; the game fetches /sounds/sfx/<id>.mp3
// so the generator must drop files into public/sounds/sfx for them to load.
const OUT_DIR = resolve(__dirname, '..', 'public', 'sounds', 'sfx');

if (!process.env.FAL_KEY){
  console.error('Missing FAL_KEY env var. Set it and rerun:');
  console.error('  FAL_KEY=your_key_here npm run sfx');
  process.exit(1);
}
fal.config({ credentials: process.env.FAL_KEY });

// One entry per game event. `text` is the prompt; `seconds` hints the duration
// (model picks something close, not exact); `loop` is for ambient beds.
const SFX = [
  { id: 'bat_crack',         seconds: 1.0, text: 'Sharp crack of a wooden baseball bat hitting a leather ball, clean solid contact, crisp single hit, no music, no voice' },
  { id: 'bat_crack_perfect', seconds: 1.2, text: 'Loud explosive baseball bat crack on a powerful home run swing, deep wood impact with a slight metallic ringing tail, single dramatic hit, no music' },
  { id: 'bat_whoosh',        seconds: 0.5, text: 'Fast wooden baseball bat swinging through air with a sharp swoosh, a clean miss with no contact, very short' },
  { id: 'bat_foul_tip',      seconds: 0.5, text: 'Light glancing tick of a baseball bat foul tip, soft wooden tap on leather, very short' },
  { id: 'glove_pop',         seconds: 0.5, text: 'Baseball thudding into a leather catchers mitt, sharp leather pop, low and tight, single impact' },
  { id: 'pitch_whoosh',      seconds: 0.6, text: 'Baseball whizzing through air at high speed, fast clean whoosh, short single pass-by, no impact' },
  { id: 'ump_strike',        seconds: 0.8, text: 'A gruff older male baseball umpire barks the single word "Strike!" — sharp punchy vocalization, deep male voice, single clean shout with no echo or music' },
  { id: 'ump_strike_three',  seconds: 1.8, text: 'A theatrical baseball umpire yells "Steee-rike three!" — long drawn-out gruff older male voice with rising intensity, single dramatic vocal call, no music or background' },
  { id: 'ump_ball',          seconds: 0.7, text: 'A calm older male baseball umpire says "Ball" — single short word, deep male voice, no music' },
  { id: 'ump_safe',          seconds: 0.9, text: 'A baseball umpire emphatically shouts "Safe!" — single sharp older male vocal call, deep voice, no music' },
  { id: 'crowd_cheer_big',   seconds: 4.0, text: 'Large baseball stadium crowd erupting in massive cheer for a home run, prolonged roar with whistles and clapping, no music' },
  { id: 'crowd_cheer_small', seconds: 2.0, text: 'Baseball stadium crowd cheering and clapping warmly for a base hit, moderate volume, no music' },
  { id: 'crowd_groan',       seconds: 2.0, text: 'Baseball stadium crowd groaning collectively in disappointment after a strikeout or out, ohhh sound, no music' },
  { id: 'crowd_walk',        seconds: 1.5, text: 'Polite baseball stadium clapping and a few cheers after a walk, short and warm' },
  { id: 'crowd_miss',        seconds: 1.5, text: 'Baseball stadium crowd murmuring softly in mild disappointment after a non-home-run contact, low ohhh sound, restrained, no music' },
  { id: 'crowd_aw',          seconds: 1.0, text: 'Baseball stadium crowd letting out a brief surprised aww after a swing-and-miss, light disappointment, no music' },
  { id: 'crowd_ambient',     seconds: 8.0, text: 'Quiet baseball stadium ambient murmur between pitches, distant crowd chatter and occasional clap, peaceful background loop, no music', loop: true },

  // ----- Variants for variety. The audio engine picks one at random per
  // playback so identical events don't sound identical every time. -----
  { id: 'crowd_cheer_big_2',   seconds: 4.0, text: 'Large baseball stadium crowd erupting in massive cheer for a home run, prolonged roar with whistles and clapping, alternate take, no music' },
  { id: 'crowd_cheer_big_3',   seconds: 4.0, text: 'Massive crowd explosion for a baseball home run, dramatic stadium roar with rising cheer and applause, no music' },
  { id: 'crowd_cheer_small_2', seconds: 2.0, text: 'Baseball stadium crowd cheering and clapping warmly for a base hit, alternate take, moderate volume, no music' },
  { id: 'crowd_groan_2',       seconds: 2.0, text: 'Baseball stadium crowd groaning collectively in disappointment after an out, alternate take, no music' },
  { id: 'crowd_miss_2',        seconds: 1.5, text: 'Baseball stadium crowd murmuring softly after a non-home-run swing, alternate take, low restrained ohh, no music' },
  { id: 'bat_crack_2',         seconds: 1.0, text: 'Sharp crack of a wooden baseball bat hitting a leather ball, clean solid contact, alternate take, single hit, no music' },
  { id: 'bat_crack_perfect_2', seconds: 1.2, text: 'Loud explosive baseball bat crack on a powerful home run swing, deep wood impact, alternate take, single dramatic hit, no music' },
];

async function exists(p){ try { await access(p); return true; } catch { return false; } }

async function main(){
  const force = process.argv.includes('--force');
  // --ids ump_strike,ump_ball   →  only generate (and force-overwrite) these
  const idsArgIdx = process.argv.indexOf('--ids');
  const onlyIds = idsArgIdx >= 0
    ? new Set((process.argv[idsArgIdx + 1] || '').split(',').map(s => s.trim()).filter(Boolean))
    : null;
  await mkdir(OUT_DIR, { recursive: true });

  let made = 0, skipped = 0, failed = 0;
  for (const item of SFX){
    if (onlyIds && !onlyIds.has(item.id)){
      skipped++;
      continue;
    }
    const out = resolve(OUT_DIR, `${item.id}.mp3`);
    // --ids implies force for the listed items.
    const shouldForce = force || onlyIds;
    if (!shouldForce && await exists(out)){
      skipped++;
      console.log(`[skip] ${item.id}.mp3 (exists, use --force to regenerate)`);
      continue;
    }
    process.stdout.write(`[gen]  ${item.id}.mp3 — "${item.text.slice(0, 60)}..." `);
    try {
      const result = await fal.subscribe('fal-ai/elevenlabs/sound-effects/v2', {
        input: {
          text: item.text,
          duration_seconds: item.seconds,
          loop: !!item.loop,
          prompt_influence: 0.5,
          output_format: 'mp3_44100_128',
        },
        logs: false,
      });
      const url = result?.data?.audio?.url;
      if (!url) throw new Error('no audio URL in response: ' + JSON.stringify(result));
      const res = await fetch(url);
      if (!res.ok) throw new Error(`fetch failed: ${res.status}`);
      const buf = Buffer.from(await res.arrayBuffer());
      await writeFile(out, buf);
      made++;
      console.log(`OK (${(buf.length/1024).toFixed(1)} KB)`);
    } catch (err){
      failed++;
      console.log(`FAIL`);
      console.error(`       ${err.message}`);
    }
  }

  console.log(`\nDone. ${made} generated, ${skipped} skipped, ${failed} failed.`);
  console.log(`Output: ${OUT_DIR}`);
  if (failed > 0) process.exit(2);
}

main().catch(err => { console.error(err); process.exit(1); });
