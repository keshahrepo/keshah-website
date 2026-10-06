// Step-by-step guides shown in the creator portal. Screenshots live in
// /public/creator-guide and have the tap target already highlighted.
//
// Creators sign up on both apps with their name@keshah.com email. Codes
// arrive by email and they choose their own password.

export type GuideStep = {
  /** Path under /public. Omit for a text-only step. */
  image?: string;
  /** Short alt text describing the screenshot. */
  alt?: string;
  text: string;
  /** Renders the step with a highlighted callout. */
  important?: boolean;
  /** Text the creator can copy with one tap (e.g. the bio). */
  copy?: string;
  /** Where to show creator-specific data passed to StepGuide. */
  slot?: "email" | "link" | "handle";
};

export type GuideSection = {
  id: string;
  title: string;
  steps: GuideStep[];
};

export type Guide = {
  id: string;
  title: string;
  sections: GuideSection[];
};

export const BIO_TEXT = "app to stop hair loss 👇";

const IMG = "/creator-guide";

export const ACCOUNT_SETUP_GUIDE: Guide = {
  id: "account-setup",
  title: "Set up your accounts",
  sections: [
    {
      id: "tiktok",
      title: "Set up TikTok",
      steps: [
        {
          image: `${IMG}/tiktok-1-signup.webp`,
          alt: "TikTok sign up screen with Use phone or email highlighted",
          text: "Open TikTok and tap Use phone or email. Pick Email and sign up with your KESHAH email. TikTok sends a code to that email, and it arrives in your personal inbox too, so check there. Then you choose your own password.",
          slot: "email",
        },
        {
          image: `${IMG}/tiktok-2-edit.webp`,
          alt: "TikTok profile with the Edit button highlighted",
          text: "Go to your profile and tap Edit.",
        },
        {
          image: `${IMG}/tiktok-3-name.webp`,
          alt: "TikTok Edit profile with Name, Username and Pronouns highlighted",
          text: "Set your name to your first name. Set your username to your first name with .keshah on the end, so Jen would be jen.keshah. If it's taken, add a number at the end, like jen.keshah1. Then set your pronouns.",
          slot: "handle",
        },
        {
          image: `${IMG}/tiktok-4-photo.webp`,
          alt: "TikTok Edit profile with the profile photo highlighted",
          text: "Tap Edit photo or avatar. Add a natural photo of your face. Something that looks real, like a normal selfie, not too professional.",
        },
      ],
    },
    {
      id: "instagram",
      title: "Set up Instagram",
      steps: [
        {
          image: `${IMG}/instagram-1-email.webp`,
          alt: "Instagram Add phone or email screen with the email field highlighted",
          text: "Open Instagram and create a new account. Tap the Email tab and use your KESHAH email. Instagram sends a code to that email, and it arrives in your personal inbox too, so check there.",
          slot: "email",
        },
        {
          image: `${IMG}/instagram-2-username.webp`,
          alt: "Instagram Create username screen with the username field highlighted",
          text: "Set your username to the same one you used on TikTok, like jen.keshah. If it's taken, add a number at the end, like jen.keshah1.",
          slot: "handle",
        },
        {
          image: `${IMG}/instagram-3-password.webp`,
          alt: "Instagram Create a password screen with the password field highlighted",
          text: "Pick a password you'll remember.",
        },
        {
          image: `${IMG}/instagram-4-photo.webp`,
          alt: "Instagram profile with the profile picture highlighted",
          text: "Go to your profile and tap your profile picture. Add a natural photo of your face. Something that looks real, like a normal selfie, not too professional.",
        },
      ],
    },
    {
      id: "bio",
      title: "Add your bio and link",
      steps: [
        {
          image: `${IMG}/bio-tiktok-1-bio.webp`,
          alt: "TikTok Edit profile with the Bio row highlighted",
          text: "On TikTok, go to your profile, tap Edit, then tap Bio. Set your bio to the text below.",
          copy: BIO_TEXT,
        },
        {
          image: `${IMG}/bio-tiktok-2-link.webp`,
          alt: "TikTok Edit profile with the Links row highlighted",
          text: "Tap Links and add your AppStack link.",
          slot: "link",
        },
        {
          image: `${IMG}/bio-instagram-1-edit.webp`,
          alt: "Instagram profile with the Edit profile button highlighted",
          text: "On Instagram, go to your profile and tap Edit profile.",
        },
        {
          image: `${IMG}/bio-instagram-2-bio.webp`,
          alt: "Instagram Edit profile with the Bio row highlighted",
          text: "Tap Bio and set it to the same text you used on TikTok.",
          copy: BIO_TEXT,
        },
        {
          image: `${IMG}/bio-instagram-3-link.webp`,
          alt: "Instagram Edit profile with the Links row highlighted",
          text: "Tap Links and add your AppStack link.",
          slot: "link",
        },
      ],
    },
  ],
};

export const POSTING_GUIDE: Guide = {
  id: "posting",
  title: "How to post",
  sections: [
    {
      id: "post-tiktok",
      title: "Post on TikTok",
      steps: [
        {
          image: `${IMG}/post-tiktok-1-plus.webp`,
          alt: "TikTok profile with the + button highlighted",
          text: "Open TikTok and tap +.",
        },
        {
          image: `${IMG}/post-tiktok-2-record.webp`,
          alt: "TikTok camera with the record button highlighted",
          text: "Record your video in the TikTok app.",
        },
        {
          image: `${IMG}/post-tiktok-3-captions.webp`,
          alt: "TikTok editing screen with Captions highlighted",
          text: "Tap Captions.",
        },
        {
          image: `${IMG}/post-tiktok-4-text.webp`,
          alt: "TikTok editor with the Text tool highlighted",
          text: "TikTok writes the captions for you automatically. Then tap Text.",
        },
        {
          image: `${IMG}/post-tiktok-5-header.webp`,
          alt: "TikTok editor with the header text box highlighted",
          text: "Type your header text, move it into place and pick a style.",
        },
        {
          image: `${IMG}/post-tiktok-6-post.webp`,
          alt: "TikTok post screen with the caption, location and Post button highlighted",
          text: "Add your caption and hashtags, set your location, and post.",
        },
      ],
    },
    {
      id: "post-instagram",
      title: "Post on Instagram",
      steps: [
        {
          text: "Use the same video you just made for TikTok. It already has the captions and the header on it.",
        },
        {
          image: `${IMG}/post-instagram-1-plus.webp`,
          alt: "Instagram profile with the + button highlighted",
          text: "Open Instagram and tap +.",
        },
        {
          image: `${IMG}/post-instagram-2-reel.webp`,
          alt: "Instagram new post screen with REEL highlighted",
          text: "Choose REEL at the bottom, then pick your video. It has to be a Reel, not a Post.",
          important: true,
        },
        {
          image: `${IMG}/post-instagram-3-share.webp`,
          alt: "Instagram New reel screen with the caption, location and Share button highlighted",
          text: "Add your caption and hashtags, set your location, and share.",
        },
      ],
    },
  ],
};
