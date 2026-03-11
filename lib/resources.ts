// All resource documents, organized by audience

export interface Resource {
  id: string;
  title: string;
  description: string;
  audience: ("admin" | "manager" | "creator")[];
  copyable: boolean; // show a "Copy" button for the full text
  content: string; // markdown-ish plain text
  pdf?: string; // path to downloadable PDF in /public/resources/
}

export const RESOURCES: Resource[] = [
  {
    id: "manager-job-desc",
    title: "Manager Job Description",
    description: "Send to potential manager candidates",
    audience: ["admin"],
    copyable: true,
    pdf: "/resources/manager-job-desc.pdf",
    content: `Creator Manager — Part-Time, Remote

At KESHAH, we're building the future of healthcare. Over 25,000 people have started their hair loss journey with KESHAH in the last year alone, and across TikTok and Instagram, we've generated 25M+ views.

We're hiring creator managers to scale this further. Your job: recruit creators, onboard them using our proven playbook, keep them consistent, and cut the ones who don't perform. You don't create content. You build and manage a team that does.

HOW IT WORKS
You find creators and run them through our system. Each new creator you recruit posts 2 videos per day for a 2-week trial using our proven hooks and reference videos. The ones who are consistent and show growth potential graduate to a paid contract. You manage this entire pipeline — from first DM to paid creator.

COMPENSATION
Base: $400/month
Per-creator bonus: $150/month for every active paid creator you manage (ongoing, not one-time)
  • 10 creators = $1,900/month
  • 20 creators = $3,400/month
  • 50 creators = $7,900/month
No cap. The more creators you onboard and retain, the more you earn.

30-DAY TARGETS
  • Get at least 10 creators into the 2-week trial
  • Graduate at least 3 to paid contracts
  • Establish weekly reporting cadence with the founder
If you don't hit 10 trial starts in 30 days, you may be cut at the company's discretion.

WHAT YOU GET
  • A proven system — playbook, hook library, reference videos, and scripts all built for you
  • Direct access to the founder
  • Uncapped earning potential tied to your performance
  • Top managers will have the option to move into a full-time role at our NYC office and creative studio

WHO THIS IS FOR
  • You're organized, responsive, and good at managing people
  • You have a network of creators or know how to find them
  • You can commit 10-15 hours/week
  • You want to join a fast-growing startup
  • Prior posting and/or social media experience is a bonus, and not required

NEXT STEP
Interview with the founder to see if you're a fit. Managers who are selected start within a week.`,
  },
  {
    id: "creator-job-desc",
    title: "Creator Job Description",
    description: "Send to potential creators during recruiting",
    audience: ["admin", "manager"],
    copyable: true,
    pdf: "/resources/creator-job-desc.pdf",
    content: `Content Creator — Paid Position

KESHAH is a drug-free hair loss solution app that is building the future of healthcare. Over 25,000 people have started their hair loss journey with us in the last year, and across TikTok and Instagram, we've generated 25M+ views. We know how to go viral, and we're looking for more creators to join the team.

THE OPPORTUNITY
Get paid to post 2 videos a day about hair loss using our proven hooks and topics. We give you exactly what to talk about and show you what good looks like. You bring the energy and personality.

Starting pay: $400/month
After your first month, you can move up to higher tiers earning up to $1,200/month.

WHAT WE PROVIDE
  • Proven hooks and topics — we've tested hundreds of videos and know what gets views
  • Reference videos from our top creators
  • Key talking points for every video
  • A creator manager who gives you daily assignments and feedback

WHAT WE'RE LOOKING FOR
  • Comfortable talking to a camera
  • Can commit to posting every day — no exceptions
  • Energy and personality on screen
  • Interested in health, wellness, or hair care (or willing to learn)
  • Prior posting experience is a bonus, and is not required to apply

THE BIGGER PICTURE
KESHAH is a fast-moving startup backed by real traction — 55K TikTok community, 25K+ users, 25M+ views. Our top creators will have the opportunity to join our in-person NYC office + creative studio as we grow.

NEXT STEP
Interview with a KESHAH creator manager. We'll understand if you have what it takes to be part of a fast growing startup environment. Creators who are selected start with our next cohort.`,
  },
  {
    id: "account-setup",
    title: "Setting Up TikTok + Instagram",
    description: "Step-by-step account setup guide for new creators",
    audience: ["admin", "manager", "creator"],
    copyable: true,
    pdf: "/resources/account-setup.pdf",
    content: `SETTING UP YOUR TIKTOK ACCOUNT

1. Open the TikTok app and tap "Sign up for TikTok"
2. Tap "Continue with Google" — sign in with your KESHAH Google account
3. Tap "Edit" on your profile
4. Set Name: [your first name]
5. Set Username: [firstname].[lastname]1
6. Set Pronouns
7. Update your profile photo

IMPORTANT: Spend 5-10 minutes each day scrolling TikTok, liking, commenting etc. (just like you do on your personal accounts). This helps the algorithm push your videos better when we start posting.

---

SETTING UP YOUR INSTAGRAM ACCOUNT

1. Create a new Instagram account
2. Set Username: [firstname].[lastname]1
3. Set Password: keshah[firstname].[firstletteroflastname]
4. Use your KESHAH email address
5. Update your profile photo

IMPORTANT: Spend 5-10 minutes each day scrolling Insta reels, liking, commenting etc. (just like you do on your personal accounts). This helps the algorithm push your videos better when we start posting.`,
  },
  {
    id: "posting-guide",
    title: "Posting Step-by-Step",
    description: "How to record, edit, and post videos on TikTok + Instagram",
    audience: ["admin", "manager", "creator"],
    copyable: true,
    pdf: "/resources/posting-guide.pdf",
    content: `TIKTOK POSTING STEP-BY-STEP

1. Record in your camera app. Settings: HD, 30FPS
2. Open TikTok and hit the '+' icon
3. Select your video and hit "Captions"
4. TikTok will auto-generate captions. Click "Text"
5. Type, position, and select style for your header text
6. Insert bio, add hashtags, set your location, and post!

Hashtags to use: #hairlosssolutions #hairlossremedy #minoxidil #naturalhair

---

INSTAGRAM POSTING STEP-BY-STEP

1. Reuse the same video you just recorded for TikTok
2. Open Instagram and hit the '+' icon
3. Select "Reel" (IMPORTANT — not Post or Story!)
4. Select your video
5. Click "CC" — Instagram will auto-generate captions
6. Type, position, and select style for your header text (Aa)
7. Insert bio, add hashtags, set your location, and share!

Hashtags to use: #hairlosssolutions #hairlossremedy #minoxidil #naturalhair`,
  },
  {
    id: "feedback-cheatsheet",
    title: "Feedback Cheat Sheet",
    description: "Copy-paste feedback templates for common situations",
    audience: ["admin", "manager"],
    copyable: false,
    content: `LOW ENERGY

Watched your video — the hook was right but your energy was flat. Compare yours to this one [reference link]. See how they open with intensity in the first 2 seconds? Re-film just the opening with more energy and repost.

---

DIDN'T FOLLOW THE HOOK

You went off-script on the hook. The hook is the most important part — it's what stops people from scrolling. Use the exact hook I sent you. You can make the rest your own but the hook needs to be word for word.

---

ACTUALLY GOOD

This one's fire. Hook was strong, energy was there the whole time, kept it tight. Do more like this.

---

RULE OF THUMB
Always be specific. "Good job" tells them nothing. "Your hook was strong but your energy dropped at 0:15 — watch the reference version and match their pacing" tells them exactly what to fix.`,
  },
  {
    id: "60-second-pitch",
    title: "The 60-Second Pitch",
    description: "What to say when a creator asks 'what is this?'",
    audience: ["admin", "manager"],
    copyable: true,
    content: `KESHAH is a drug-free hair loss app. Most hair loss treatments just treat symptoms — KESHAH fixes the root cause: scalp tension. Tight scalp restricts blood flow to your follicles, which is what actually causes hair loss. The app guides you through specific massage techniques that release tension and restore blood flow. 20 minutes a day, 60 days, no drugs. We've gotten 25M+ views across TikTok and Instagram and over 25,000 members are stopping their hair loss with KESHAH.

KEY FACTS (know these cold):
  • Drug-free — no Minoxidil, no Finasteride, no side effects
  • Root cause: scalp tension restricts blood flow to follicles
  • Mechanism: specific massage techniques that release tension
  • 20 minutes per day, most see hair fall stop within 60 days
  • 25,000+ members
  • 25M+ views
  • 4.8 avg rating across 3,500+ reviews on App Store / Play Store
  • Website: www.keshah.com
  • Founder TikTok: @keshah_us
  • Founder Instagram: @keshah_us`,
  },
  {
    id: "dm-templates",
    title: "DM Templates",
    description: "Copy-paste templates for recruiting outreach",
    audience: ["admin", "manager"],
    copyable: false,
    content: `WARM DM (People You Know)

Hey [name] — I'm working with a hair loss app called KESHAH that's blowing up on TikTok. 25M+ views, 25K+ members. We're looking for creators to post short-form content about hair loss. It's paid. You'd be a good fit. Interested?

(Adapt this to your speaking style and relationship with that person.)

---

COLD DM (Strangers)

[Paid Opportunity] Hey — I recruit creators for a hair loss app (25M+ views on TikTok/Insta, 25,000+ members). It's paid and I think you could be a good fit. Lmk if interested.

---

FOLLOW-UP (if no reply after 24-48 hours)

Hey just bumping this — spots fill up fast. If you're interested lmk and I can send you the details.

---

VIDEO APPLICATION REQUEST

Love it — I think you'd be a great fit. One last step before I send the contract: record a quick video of yourself on your phone — no longer than 2 minutes — on why you'd be a good fit for this. Send it over and we'll get back to you.`,
  },
  {
    id: "cut-templates",
    title: "Cut & Graduation Messages",
    description: "Templates for cutting and graduating creators",
    audience: ["admin", "manager"],
    copyable: false,
    content: `THE CUT MESSAGE

Hey [name] — you've missed [X] days of posting. The trial requires posting every day. We're going to end the trial here. No hard feelings — if things change and you want to try again down the road, reach out.

---

THE GRADUATION MESSAGE

Great news — you crushed the trial. We're moving you to a paid contract. I'm sending the details now. Same cadence — 2 videos a day. Pay starts at $400/month. Welcome to the team.

---

PAID CREATOR — DAY 1 MISSED

Hey — didn't see a post today. Everything good?

---

PAID CREATOR — DAY 2 MISSED

Hey [name] — that's 2 days without posting. The contract is 2 videos per day. If something's going on let me know, otherwise I need you back on track tomorrow.

---

PAID CREATOR — DAY 3+ MISSED

Escalate to the founder. The creator may need to be dropped or moved to a lower tier. Don't let it slide.`,
  },
];
