// Contract templates

export interface ContractTemplate {
  id: string;
  title: string;
  type: "creator" | "manager";
  content: string; // plain text with {{placeholders}}
}

export const CONTRACT_TEMPLATES: ContractTemplate[] = [
  {
    id: "creator-trial",
    title: "Creator Trial Agreement",
    type: "creator",
    content: `KESHAH CONTENT CREATOR TRIAL AGREEMENT

This Agreement is entered into as of {{date}} between KESHAH ("Company") and {{signer_name}} ("Creator").

1. TRIAL PERIOD
Creator agrees to a 14-day trial period beginning on the date this agreement is signed. During the trial period, Creator will post content as directed by their assigned Creator Manager.

2. CONTENT REQUIREMENTS
- Week 1 (Days 1–7): 1 video per day on TikTok and Instagram
- Week 2 (Days 8–14): 2 videos per day on TikTok and Instagram
- All content must use hooks, talking points, and reference materials provided by KESHAH
- Creator must post every day during the trial — no exceptions

3. CONTENT OWNERSHIP
All content created during the trial period and any subsequent paid period is owned by the Creator. KESHAH retains the right to repost, share, and reference the content across its social media channels and marketing materials.

4. TRIAL EVALUATION
At the end of the 14-day trial, KESHAH will evaluate Creator's performance based on consistency, content quality, and engagement. Creators who meet the standard will be offered a paid contract.

5. EARLY TERMINATION
- If Creator misses 2 consecutive days or 3 total days of posting, the trial may be ended early at the Company's discretion.
- Creator may end the trial at any time by notifying their Creator Manager.

6. COMPENSATION
The trial period is unpaid. Creators who graduate to a paid contract will start at $400/month with the opportunity to move to higher tiers ($700/month, $1,200/month) based on performance.

7. INDEPENDENT CONTRACTOR
Creator is an independent contractor, not an employee of KESHAH. Creator is responsible for their own taxes and expenses.

8. CONFIDENTIALITY
Creator agrees not to share KESHAH's internal strategies, hook libraries, or playbooks with anyone outside the company.

By signing below, both parties agree to the terms outlined above.`,
  },
  {
    id: "creator-paid",
    title: "Creator Paid Contract",
    type: "creator",
    content: `KESHAH CONTENT CREATOR AGREEMENT

This Agreement is entered into as of {{date}} between KESHAH ("Company") and {{signer_name}} ("Creator").

1. ENGAGEMENT
Creator agrees to create and post content on TikTok and Instagram as directed by their assigned Creator Manager at KESHAH.

2. CONTENT REQUIREMENTS
- 2 videos per day on TikTok and Instagram
- All content must use hooks, talking points, and reference materials provided by KESHAH
- Creator must post every day — consistency is required
- Creator will respond to their Creator Manager's messages within 24 hours

3. COMPENSATION
- Starting rate: {{pay_tier}}/month
- Pay tiers: $400/month → $700/month → $1,200/month
- Tier increases are based on performance, consistency, and content quality at KESHAH's discretion
- Payment is made monthly via the method agreed upon by both parties

4. CONTENT OWNERSHIP
All content created is owned by the Creator. KESHAH retains the right to repost, share, and reference the content across its social media channels and marketing materials.

5. TERMINATION
- Either party may terminate this agreement with 7 days written notice
- KESHAH may terminate immediately if Creator misses 3 or more days of posting without prior approval
- Upon termination, any outstanding compensation will be paid within 30 days

6. INDEPENDENT CONTRACTOR
Creator is an independent contractor, not an employee of KESHAH. Creator is responsible for their own taxes and expenses.

7. CONFIDENTIALITY
Creator agrees not to share KESHAH's internal strategies, hook libraries, or playbooks with anyone outside the company.

By signing below, both parties agree to the terms outlined above.`,
  },
  {
    id: "manager",
    title: "Creator Manager Agreement",
    type: "manager",
    content: `KESHAH CREATOR MANAGER AGREEMENT

This Agreement is entered into as of {{date}} between KESHAH ("Company") and {{signer_name}} ("Manager").

1. ROLE
Manager will recruit, onboard, and manage content creators for KESHAH's social media channels. Manager will use KESHAH's proven system including the playbook, hook library, and reference materials.

2. RESPONSIBILITIES
- Recruit content creators through warm and cold outreach
- Onboard new creators using KESHAH's system
- Manage trial creators: assign daily hooks, review content, provide feedback
- Cut underperforming creators and graduate high performers
- Submit weekly reports to the founder
- Commit a minimum of 10–15 hours per week

3. COMPENSATION
- Base: $400/month
- Per-creator bonus: $150/month for every active paid creator managed (ongoing)
- No cap on earnings
- Payment is made monthly via the method agreed upon by both parties

4. 30-DAY TARGETS
- Get at least 10 creators into the 2-week trial within the first 30 days
- Graduate at least 3 creators to paid contracts
- Establish weekly reporting cadence with the founder
- Failure to meet these targets may result in termination at the Company's discretion

5. TERMINATION
- Either party may terminate this agreement with 14 days written notice
- KESHAH may terminate immediately if Manager fails to meet minimum performance standards
- Upon termination, any outstanding compensation will be paid within 30 days

6. INDEPENDENT CONTRACTOR
Manager is an independent contractor, not an employee of KESHAH. Manager is responsible for their own taxes and expenses.

7. CONFIDENTIALITY
Manager agrees not to share KESHAH's internal strategies, creator databases, hook libraries, or playbooks with anyone outside the company.

By signing below, both parties agree to the terms outlined above.`,
  },
];
