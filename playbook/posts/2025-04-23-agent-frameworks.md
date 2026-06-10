---
title: "Agent Frameworks"
date: 2025-04-23
layout: default
category: play
---

## Agent Frameworks

Agents are just programs with tool access. Most "agentic" patterns are overcomplicated. Here's what actually works.

### What Agents Actually Are

An agent is a loop: observe → reason → act → observe → repeat. That's it. Every "agentic framework" you've heard of implements this same loop with different bells and whistles.

{% raw %}
```python
def agent_loop(initial_state, tools, max_steps=10):
    """
    A minimal agent loop. 20 lines, no framework.
    
    State → Observe current state → Use tools → Update state → Repeat
    """
    state = initial_state
    
    for step in range(max_steps):
        # 1. Plan (what to do next)
        plan = get_llm_response(f"""You are in state: {state}
Your tools: {list(tools.keys())}
What should you do next? Respond with a JSON object:
{{"action": "tool_name", "args": {{"key": "value"}}}}""")
        
        # 2. Act (execute the action)
        action = parse_json(plan)
        result = tools[action["action"]](**action["args"])
        
        # 3. Observe (check if we're done)
        state = update_state(state, result)
        
        if is_complete(state):
            return state
        
        # 4. If not complete, go to step 1
    
    return state  # Failed to complete in max_steps

# That's the whole pattern. Every framework just adds:
# - More memory (short-term, long-term)
# - More planning strategies (ReAct, Reflexion, Tree of Thought)
# - More tool types (APIs, web search, code execution)
# - More complexity (multi-agent, hierarchical, etc.)

# The simplest agent loop handles 80% of use cases.
```
{% endraw %}

### The Most Useful Agent Patterns

```python
"""
Agent patterns, ranked by practical value:

1. Simple tool-calling agent (most useful)
   - Observe state → call tool → check result → repeat
   - Works for: data collection, API integration, code execution
   - Example: "Find the bug, fix it, run tests"

2. ReAct agent (Reason + Act)
   - Reason about what to do → act → observe result → reason again
   - Works for: multi-step tasks where each step depends on previous result
   - Example: debugging, research, analysis

3. Reflexion agent (self-correction)
   - Run → evaluate → correct → rerun
   - Works for: tasks where first attempt is often imperfect
   - Example: code generation, content creation

4. Hierarchical agent (manager + workers)
   - Manager creates plan → workers execute → manager reviews → repeat
   - Works for: complex multi-step tasks
   - Example: large code changes, product releases

5. Multi-agent (team of agents)
   - Multiple agents with different roles, communicating via messages
   - Works for: complex workflows where different expertise is needed
   - Example: "writer + reviewer + fact-checker" workflow

MOST PRACTICAL: Start with pattern #1. Add complexity only when you need it.
"""
```

### When Agents Actually Help vs When They Don't

```python
"""
Agents help when:
- The task requires multiple steps (not just a single API call)
- Each step depends on the result of the previous one
- A human couldn't easily script the workflow
- The environment is dynamic (results vary by run)

Agents DON'T help when:
- There's a single step (use function calling directly)
- You can write a script (scripts are more reliable)
- Latency matters (agent loops = more LLM calls = more latency)
- Reliability matters (agent loops = more failure points)

Rule: if you can write a script that does the job, write it.
Agents are for tasks that CAN'T be scripted.
"""
```

### Agent Evaluation (Measuring Agent Quality)

```python
"""
Agent evaluation metrics (most important first):

1. Task success rate: what % of tasks complete successfully?
   → If <90%, your agent is unreliable.
   → Fix: better error handling, more tools, simpler workflows

2. Step efficiency: how many steps does it take to complete a task?
   → Fewer steps = better. Each step = 1 LLM call = latency + cost.
   → If your agent takes 20 steps for a 3-step task, it's lost.
   → Fix: better planning, more capable tools

3. Tool accuracy: how often does the agent call tools correctly?
   → If the agent makes incorrect tool calls, fix the prompt or add validation.

4. Latency per step: average time per step.
   → If each step takes 10s, a 5-step task takes 50s. Too slow.
   → Fix: faster model, speculative decoding, caching

5. Cost per task: total token cost per task.
   → Cost per task = steps × tokens per step × cost per token
   → If it costs $0.50 per task and you have 1M tasks, that's $500K.

Agent evaluation checklist:
- [ ] Task success rate > 95%
- [ ] Step efficiency matches human baseline
- [ ] Tool accuracy > 99%
- [ ] Latency per step < 5s
- [ ] Cost per task < your budget
"""
```

### Multi-Agent: When It Makes Sense

```python
"""
Multi-agent architecture: the hype vs reality.

Hype: "10 agents solving your problem!"
Reality: "10 agents taking 10x longer to do the same job as one."

When multi-agent makes sense:
1. Different tasks require different expertise (writer vs code vs review)
2. Each agent can work independently (parallelizable)
3. The output of one agent is the input of another (pipeline)

When multi-agent does NOT make sense:
1. Tasks are simple (one agent can do them)
2. Latency matters (more agents = more coordination = slower)
3. You need predictability (more agents = more failure modes)
4. You're using it because it's trendy (it's not trendier than writing code)

If you go multi-agent, use a simple pattern:
- Manager agent: creates plan, delegates tasks
- Worker agents: execute assigned tasks
- Reviewer agent: checks output quality
- No communication between workers (they report to the manager)
"""
```

### Practical Tips

1. **Agents are programs with tool access**: Write them like programs. Test them like programs. Deploy them like programs.
2. **Minimize steps**: Each step = one LLM call = ~$0.005 + latency. Fewer steps = cheaper + faster + more reliable.
3. **Validate tool outputs**: Agents make mistakes. Validate every tool call's result before proceeding.
4. **Set step limits**: Always limit agent steps. Without a limit, the agent loops forever (and charges you forever).
5. **Log everything**: Agent decisions are non-deterministic. Log every step for debugging.
6. **Start simple**: Most "agentic" systems are just loops with function calls. Start with the loop. Add agents when you need to.

### Summary

Agents are programs with tool access:
- **Simple agent**: observe → reason → act → repeat (for most cases)
- **ReAct**: reasoning + action loop (for multi-step tasks)
- **Reflexion**: self-correction loop (for imperfect first attempts)
- **Multi-agent**: multiple agents working together (for complex pipelines)
- **Evaluate**: task success rate, step efficiency, cost, latency

Build agents like programs. Test them. Measure them. Deploy them. The framework is a loop, not a mystic art.
