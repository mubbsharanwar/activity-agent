export const GITHUB_API_URL = "https://api.github.com";
export const GITHUB_REPOS_PATH = "/repos";
export const GITHUB_GIT_PATH = "/git";
export const ACTIVITY_DIR = "app/activities";

export function githubRepositoryUrl(owner: string, repo: string) {
  return `${GITHUB_API_URL}${GITHUB_REPOS_PATH}/${owner}/${repo}`;
}

export const SYSTEM_PROMPT = `Review the user's content, including any attached text or image, and analyze it before you suggest activities.

When the user has not selected an activity:
- Suggest 3 interactive screen activities a learner can complete on the page, the way an LMS lesson does. Pick the screen that fits the content. A screen can be a quiz, puzzle, matching, drag and drop, sorting, labeling, classification, flashcards, fill in the blank, hotspot, dialogue, simulation, building blocks, sequence, or any other on-screen activity. Do not stay inside that list.
- Reply with JSON only, in this shape: {"activities":[{"title":"string","summary":"string","type":"short screen name"}]}
- Each title is a short activity name. Each summary is one sentence about what the learner does on the screen. type is a short name for that screen.
- Do not call a tool. Do not output a tool call.

When the user selects an activity, call get_repository first. Compare the selection with the repository description, topics, README, and activityFiles.
- If that activity already exists, reply with this sentence only: This activity already exists.
- If it does not exist, write one interactive screen and call push_activity. Do not print the source in the reply.
- If push_activity returns an error, fix that error and call push_activity again. Do not print the source.
- The screen lives under app/activities/<slug>/. Do not use a src/ directory. The component is a client component. Every question, choice, item, label, and answer lives in data, not in the component text.
- push_activity arguments are slug, title, component, page, css, and data. data.type is the short screen name. data.title is the activity title. Put the rest of the screen content in data.
- The component starts with "use client", accepts a data prop, and lets the learner complete the activity on the screen. It reads its content from data. It can be used with the keyboard. It shows the result in text, not by color alone. The component imports only react and "./activity.css". Put the page styles in css and use those class names. The page imports only ./activity and ./data.json.
- Do not use network calls or environment variables.`;

export const TOOLS = [
  {
    type: "function" as const,
    function: {
      name: "get_repository",
      description: "Load the configured GitHub repository, including its README and activity files.",
      parameters: { type: "object", properties: {}, additionalProperties: false },
    },
  },
  {
    type: "function" as const,
    function: {
      name: "push_activity",
      description: "Commit and push a finished activity to the GitHub repository.",
      parameters: {
        type: "object",
        properties: {
          slug: { type: "string" },
          title: { type: "string" },
          component: { type: "string" },
          page: { type: "string" },
          css: { type: "string" },
          data: { type: "object" },
        },
        required: ["slug", "title", "component", "page", "css", "data"],
        additionalProperties: false,
      },
    },
  },
];
