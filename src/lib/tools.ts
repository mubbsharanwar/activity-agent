export const TOOLS = [
  {
    type: "function" as const,
    function: {
      name: "get_repository",
      description:
        "Load the configured GitHub repository, including its description and README, so the answer can use that context.",
      parameters: {
        type: "object",
        properties: {},
        additionalProperties: false,
      },
    },
  },
];

export const TOOL_CHOICE = {
  type: "function" as const,
  function: { name: "get_repository" },
};
