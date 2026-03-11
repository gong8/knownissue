export const EmailType = {
  WELCOME: "welcome",
  FIRST_IMPACT: "first_impact",
  MILESTONE: "milestone",
  CHANGELOG: "changelog",
} as const;

export type EmailType = (typeof EmailType)[keyof typeof EmailType];

export interface WelcomeData {
  displayName: string;
}

export interface FirstImpactData {
  displayName: string;
  issueTitle: string;
}

export interface MilestoneData {
  displayName: string;
  milestoneType: string;
  milestoneLabel: string;
  count: number;
}

export interface ChangelogData {
  title: string;
  body: string;
}

export type EmailData = {
  welcome: WelcomeData;
  first_impact: FirstImpactData;
  milestone: MilestoneData;
  changelog: ChangelogData;
};
