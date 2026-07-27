export const MIMO_SUCCESS_RESPONSE = {
  choices: [{
    finish_reason: "stop",
    message: {
      content: "Generated prose is not evidence.",
      annotations: [{
        type: "url_citation",
        url: "https://www.dsv.com/zh-cn/our-solutions/modes-of-transport/sea-freight/less-than-container-load",
        title: "Less than container load",
        summary: "Public service description",
        site_name: "www.dsv.com"
      }]
    }
  }],
  usage: { web_search_usage: { tool_usage: 3, page_usage: 15 } }
} as const;
