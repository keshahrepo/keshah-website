/**
 * Seed hooks from top-performing KESHAH TikTok videos.
 *
 * Usage:
 *   npx tsx scripts/seed-hooks.ts
 *
 * This calls the hooks API directly via HTTP. Make sure the dev server is running.
 * You must be logged in as admin (have a valid cookie).
 *
 * Alternative: run via the dashboard Hooks page (add manually or paste JSON).
 */

// These hooks are extracted from the top 12 performing KESHAH TikTok videos (300K - 2.4M views).
// Each hook = the opening line + structured talking points derived from the video.

const hooks = [
  {
    title: "If you're losing hair, take two fingers and pinch the areas of your scalp where you're losing hair",
    category: "scalp-test",
    views: 2400000,
    reference_video_url: "https://www.tiktok.com/@keshah_us/video/7542148485546528055",
    core_message: "Your scalp tightness is the root cause of hair loss — not a product deficiency. Scalp stimulation exercises for 20 minutes a day break the tension and let hair grow again.",
    talking_points: [
      "Pinch where you're losing hair — hairline or crown. Notice how tight it is.",
      "Tight scalp = blood can't reach follicles = hair can't grow",
      "Doesn't matter what minoxidil or products you apply if scalp is tight",
      "Fix: scalp stimulation exercises, 20 minutes a day",
      "No drugs needed — target the root cause"
    ],
  },
  {
    title: "Let me draw and show you why you're losing hair right now",
    category: "education",
    views: 2300000,
    reference_video_url: "https://www.tiktok.com/@keshah_us/video/7469971838978755871",
    core_message: "There's a layer of scalp tension blocking products from reaching your hair follicles. Until you break it down, nothing you apply will work.",
    talking_points: [
      "Draw/show: you → hair thinning → applying products → not working",
      "Layer of scalp tension sits between products and your follicles",
      "Test: try to pinch the top of your scalp — feel how tight it is",
      "Best minoxidil or oils can't reach follicles through tight scalp",
      "Specific massaging techniques open up the channel so products work"
    ],
  },
  {
    title: "If you're losing hair, this is the only video you need to watch",
    category: "comprehensive",
    views: 674100,
    reference_video_url: "https://www.tiktok.com/@keshah_us/video/7523026499402730783",
    core_message: "Hair loss is caused by tight scalp restricting blood flow. Drugs are bandage fixes that stop working when you stop taking them. Loosen your scalp for a permanent solution.",
    talking_points: [
      "Drugs like finasteride and minoxidil are bandage fixes — hair falls out when you stop",
      "Root cause: scalp tension restricts blood flow to follicles",
      "If blood doesn't reach follicles, hair thins and falls",
      "Long-term fix: break down scalp tension",
      "Logical and simple — fix the scalp, fix the hair"
    ],
  },
  {
    title: "If you're losing hair and you don't want to take minoxidil or finasteride — this video is for you",
    category: "personal-story",
    views: 654800,
    reference_video_url: "https://www.tiktok.com/@keshah_us/video/7604193656945298719",
    core_message: "Personal story of reversing hair loss without drugs by fixing scalp tension with specific techniques. Stopped hair fall in 60 days.",
    talking_points: [
      "Was losing 100+ strands per shower. Dermatologist said drugs or go bald in 2 years.",
      "Read horror stories about finasteride side effects — sexual dysfunction, brain fog",
      "Discovered scalp tension research. Scalp felt like concrete.",
      "Created 6-7 techniques. Scalp got flexible in 30 days, hair fall stopped by day 60.",
      "Pressing technique, pinching technique — forceful, not gentle massage",
      "Now helps thousands through an app — same system that worked personally"
    ],
  },
  {
    title: "If you're losing your hair, take two fingers and pinch the areas where you're losing hair",
    category: "scalp-test",
    views: 577100,
    reference_video_url: "https://www.tiktok.com/@keshah_us/video/7553728374980529439",
    core_message: "Tight scalp areas correspond exactly to where you lose hair. Think of it like cement over soil — grass can't grow through cement. Break down the tension.",
    talking_points: [
      "Pinch test: tight areas = where hair is falling out",
      "Tight scalp blocks blood flow to follicles",
      "Analogy: soil + cement layer = grass can't grow. Same with scalp.",
      "Pharmaceutical companies profit from selling products, not fixing root cause",
      "Skull shape impacts hair loss — some people more prone",
      "Breaking down tension reverses the process"
    ],
  },
  {
    title: "Four years ago I started losing my hair — I was seeing 100 strands every shower",
    category: "personal-story",
    views: 467600,
    reference_video_url: "https://www.tiktok.com/@keshah_us/video/7465859636218973470",
    core_message: "Hair loss reversal is like working out — right diet (ingredients), right exercises (scalp massages), and tools to speed up results. No magic fix, but consistency works.",
    talking_points: [
      "Was losing 100 strands per shower. Dermatologist prescribed drugs.",
      "1.5 years of research — every paper, Ayurveda, Japanese studies",
      "Discovered: consistency + right techniques = results, not magic pills",
      "Stopped hair fall in 3 months. New growth by month 4.",
      "Scalp flexibility is critical for regrowth",
      "Like working out: right diet + right exercises + tools = results",
      "Worked with 120+ people seeing results across the board"
    ],
  },
  {
    title: "If you're losing hair, do this one test for me — take your fingers and pinch your scalp",
    category: "scalp-test",
    views: 464200,
    reference_video_url: "https://www.tiktok.com/@keshah_us/video/7492580857358634271",
    core_message: "No product will reverse hair loss long-term because they can't penetrate a tight scalp. Break down scalp tension first, then products can actually do their job.",
    talking_points: [
      "Test: pinch crown and hairline — much tighter than back and sides",
      "Back and sides (where you keep hair) are more flexible",
      "No product reaches follicles through tight scalp — minoxidil, oils, shampoos",
      "Specific massaging techniques, 9-10 minutes per day",
      "120+ people helped in 4 years",
      "85% see increased flexibility and reduced hair fall within 8 weeks"
    ],
  },
  {
    title: "These are the three massaging techniques you need to know to reverse hair loss naturally",
    category: "techniques",
    views: 435100,
    reference_video_url: "https://www.tiktok.com/@keshah_us/video/7527132585118518558",
    core_message: "Three core techniques: scalp pressing with knuckles, scalp pinching, and scalp sliding. All focus on the areas where you're losing hair.",
    talking_points: [
      "Technique 1: Scalp pressing — make a fist, press with force on crown and hairline",
      "Technique 2: Scalp pinching — focus on areas of hair loss, one or two handed",
      "Technique 3: Scalp sliding — slide the skin itself (not hair) front and back to increase circulation",
      "Feel sensitivity at first — that's normal, scalp health is poor",
      "Over time scalp gets flatter and more flexible",
      "8 out of 10 people see results within 90 days with consistent technique"
    ],
  },
  {
    title: "This is my exact protocol I've used to reverse my own hair loss",
    category: "protocol",
    views: 405000,
    reference_video_url: "https://www.tiktok.com/@keshah_us/video/7548244489328938270",
    core_message: "Full protocol: mechanotherapy techniques for 20+ minutes daily to break down scalp tension. 9 out of 10 people see results within 120 days. No drugs, just fix the scalp.",
    talking_points: [
      "Same approach used with 150+ people — 9/10 see results in 120 days",
      "Not products or serums — fix your scalp where hair grows",
      "Mechanotherapy: specific techniques designed to break down scalp tension",
      "7-8 different techniques with proper form and duration",
      "Day 15: start feeling circulation return",
      "Day 30: scalp much more flexible, can pinch areas you couldn't before",
      "Day 60: hair fall reduces significantly",
      "Day 90: hair fall completely stops for most people",
      "Requires 20 minutes a day — not a magic fix"
    ],
  },
  {
    title: "If you even see yourself balding as a man, don't listen to all the natural bullshit",
    category: "contrarian",
    views: 369800,
    reference_video_url: "https://www.tiktok.com/@keshah_us/video/7605016277303823647",
    core_message: "Don't rely on drugs OR magical oils. Fix your scalp — the place where hair literally grows. Specific scalp exercises 20 minutes a day.",
    talking_points: [
      "Don't take finasteride, minoxidil, or rely on magical oils",
      "It's not about a product — it's about your scalp",
      "Hair grows on your scalp. Fix the scalp, fix the hair.",
      "Was supposed to go bald 4 years ago — still has full head of hair",
      "Loosen it up. Remove inflammation. Remove tightness.",
      "Specific scalp exercises, 20 minutes a day",
      "Like brushing teeth — take care of your scalp daily",
      "Do it with force. Break down the tension. It works if you work for it."
    ],
  },
  {
    title: "If you're losing hair, stop everything — take your hand and press your traps",
    category: "posture",
    views: 301800,
    reference_video_url: "https://www.tiktok.com/@keshah_us/video/7557104458388311326",
    core_message: "Tight traps, tight neck, and tight scalp from poor posture (phones, laptops) are causing hair loss in younger generations. Release the tension chain.",
    talking_points: [
      "Press your traps — if there's pain, that could be causing hair loss",
      "Tight traps → tight neck → tight scalp = restricted blood flow",
      "Poor posture from phones and laptops — why younger people are losing hair earlier",
      "Need to release tension in traps, neck, AND scalp",
      "Improve habits + release tension = blood flow returns, hair grows",
      "Not just scalp — the whole tension chain matters"
    ],
  },
  {
    title: "Most people don't understand how minoxidil actually works — here's how in 60 seconds",
    category: "education",
    views: 300100,
    reference_video_url: "https://www.tiktok.com/@keshah_us/video/7494135148384898346",
    core_message: "Minoxidil just widens blood vessels temporarily. When you stop, vessels tighten again. The real fix: loosen your scalp so vessels never tighten in the first place.",
    talking_points: [
      "Minoxidil opens blood vessels → blood reaches follicles → hair grows",
      "Stop minoxidil → vessels tighten → blood stops → hair falls again",
      "Question: WHY are blood vessels tight in the first place?",
      "Answer: tight scalp skin compresses blood vessels",
      "Long-term fix: loosen the scalp tissue so vessels stay open naturally",
      "No minoxidil needed once tension is resolved",
      "Japanese research supports this — scalp tension is the root cause"
    ],
  },
];

// Output as JSON for manual import or API call
console.log(JSON.stringify(hooks, null, 2));
console.log(`\n✅ ${hooks.length} hooks ready for import`);
console.log(`\nTo import via API (with dev server running and admin cookie):`);
console.log(`  curl -X POST http://localhost:3000/api/hooks \\`);
console.log(`    -H "Content-Type: application/json" \\`);
console.log(`    -H "Cookie: keshah_dash=YOUR_TOKEN" \\`);
console.log(`    -d @scripts/hooks.json`);
