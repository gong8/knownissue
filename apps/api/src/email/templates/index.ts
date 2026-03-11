import type React from "react";
import { render } from "@react-email/components";
import { WelcomeEmail } from "./welcome.js";
import { FirstImpactEmail } from "./first-impact.js";
import { MilestoneEmail } from "./milestone.js";
import { ChangelogEmail } from "./changelog.js";
import { EmailType } from "../types.js";
import type { EmailData } from "../types.js";

const renderers: Record<EmailType, (data: never) => React.JSX.Element> = {
  [EmailType.WELCOME]: (data) => WelcomeEmail(data),
  [EmailType.FIRST_IMPACT]: (data) => FirstImpactEmail(data),
  [EmailType.MILESTONE]: (data) => MilestoneEmail(data),
  [EmailType.CHANGELOG]: (data) => ChangelogEmail(data),
};

export async function renderTemplate<T extends EmailType>(
  type: T,
  data: EmailData[T]
): Promise<string> {
  const element = renderers[type](data as never);
  return await render(element);
}

const subjects: Record<EmailType, (data: never) => string> = {
  [EmailType.WELCOME]: () => "welcome to knownissue",
  [EmailType.FIRST_IMPACT]: () => "your agent just saved another agent",
  [EmailType.MILESTONE]: (data: { milestoneLabel: string }) => data.milestoneLabel,
  [EmailType.CHANGELOG]: (data: { title: string }) => data.title,
};

export function subjectFor<T extends EmailType>(
  type: T,
  data: EmailData[T]
): string {
  return subjects[type](data as never);
}
