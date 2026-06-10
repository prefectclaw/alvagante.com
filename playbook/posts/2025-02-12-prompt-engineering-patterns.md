---
title: "Prompt Engineering Patterns"
date: 2025-02-12
layout: default
category: play
---

## Prompt Engineering Patterns

Zero-shot, few-shot, CoT, ReAct — patterns that actually work and ones that don't.

### What Prompt Engineering Actually Is

Prompt engineering is not "crafting perfect prompts." It's about:
1. **Consistently getting useful outputs** from models you don't fully control
2. **Reducing variance** in what the model returns
3. **Structuring inputs** so the model's strengths work for you, not against you

It's closer to systems engineering than creative writing.

### Zero-Shot Prompting

The simplest form: give the model a task and expect it to do it. No examples, no scaffolding. Just the task.

```python
# Zero-shot: just tell the model what to do
prompt = """Analyze the sentiment of this review and return a JSON object with:
- sentiment: positive/negative/neutral
- confidence: 0-1
- reasons: list of key factors

Review: {review_text}"""

# When zero-shot works: well-defined tasks, clear output format
# When zero-shot fails: ambiguous tasks, complex reasoning, nuanced tone
```

Zero-shot works when:
- The model has seen similar tasks during training
- The task is well-defined (not ambiguous)
- You're not asking the model to "think" about something novel

### Few-Shot Prompting

Give the model examples of the pattern you want. This is "show, don't tell" in its most literal form.

```python
# Few-shot: show the model what you want
prompt = """Analyze the sentiment of this review.

Examples:
Review: "I love this product! Best purchase I've ever made."
Sentiment: positive
Confidence: 0.95
Reasons: ["love", "best purchase"]

Review: "Terrible service. Never ordering again."
Sentiment: negative
Confidence: 0.85
Reasons: ["terrible service", "never ordering"]

Review: "It's okay. Nothing special."
Sentiment: neutral
Confidence: 0.80
Reasons: ["nothing special"]

Now analyze this review:
Review: "The food was decent but the service was slow.""""
# Expected output:
# Sentiment: neutral
# Confidence: 0.65
# Reasons: ["decent food", "slow service"]
```

Few-shot works when:
- The model benefits from seeing the pattern
- The examples cover edge cases you care about
- You need consistent formatting

The most important rule: **use examples that look like what you expect to get.** If you only show perfect examples, the model will try to produce perfect examples and fail on real data.

### Chain of Thought (CoT)

Ask the model to explain its reasoning. This forces it to generate intermediate thoughts before the final answer, which significantly improves accuracy on reasoning tasks.

```python
# CoT: ask the model to reason step by step
prompt = """A farmer has 17 sheep. All but 9 run away. How many sheep does the farmer have left?

Reason step by step:
- The farmer starts with 17 sheep
- "All but 9" means 17 - 9 = 8 sheep ran away
- But "all but 9" means ALL sheep ran away except 9
- So the farmer has 9 sheep left

Answer: 9

Now solve this:
A train leaves Station A at 60 mph. Another train leaves Station B at 80 mph. 
Station B is 200 miles from Station A. When do they meet?

Reason step by step:"""

# The model will generate a reasoning trace before answering
# This trace is what makes CoT work. It forces the model to:
# 1. Break down the problem
# 2. Build intermediate conclusions
# 3. Use those conclusions to reach the final answer

# Key insight: CoT helps because it gives the model "scratch work"
# Without CoT, the model tries to jump from input to output in one step
# With CoT, it breaks the problem into manageable pieces
```

When CoT works:
- Multi-step reasoning tasks
- Math problems
- Code generation
- Decision-making under uncertainty

When CoT doesn't work:
- Simple factual queries (it adds noise)
- When you need the answer, not the reasoning (CoT wastes time and tokens)
- On models that don't support chain-of-thought natively (some closed APIs override or ignore it)

### Self-Consistency

Instead of getting one answer, get N answers via CoT and pick the most common one. Like "vote on your own reasoning."

```python
# Self-consistency: get multiple CoT answers, pick the majority
from collections import Counter

def self_consistency(prompt, n_trials=5):
    """
    Get multiple CoT answers and pick the most common one.
    
    This works because individual CoT attempts may have different errors.
    The majority vote reduces the error rate.
    """
    answers = []
    for i in range(n_trials):
        full_prompt = prompt + "\nReason step by step:"
        answer = get_llm_response(full_prompt)
        answers.append(answer)
    
    # Pick the most common answer
    most_common = Counter(answers).most_common(1)[0]
    return most_common[0], most_common[1] / n_trials

# Example:
prompt = """What is the capital of Australia?
Options: Sydney, Melbourne, Canberra, Perth"""

best_answer, confidence = self_consistency(prompt)
print(f"Answer: {best_answer} (confidence: {confidence:.2f})")

# When self-consistency works:
# - Multiple reasoning paths to the same answer
# - High-quality individual CoT traces
# - Enough samples (5-10 is usually enough)

# When it doesn't work:
# - If all reasoning paths lead to the same error
# - Open-ended tasks (no "correct" answer to count)
```

### ReAct (Reason + Act)

For tasks that involve using tools or external information — the model reasons about what to do, acts on the world, observes the result, and repeats.

```python
# ReAct: Reason → Act → Observe → Repeat
prompt = """You are a helpful assistant that can look up facts.

Task: What is the capital of France?

Reason: I need to look up the capital of France.
Action: search("capital of France")
Observation: Paris
Reason: I have found the answer.
Answer: Paris

Task: What is the population of Paris?

Reason: I know the capital is Paris, but I need its population.
Action: search("population of Paris")
Observation: Approximately 2.1 million
Reason: I have found the answer.
Answer: Approximately 2.1 million"""

# ReAct works for:
# - Tasks requiring external information
# - Multi-step planning
# - Code execution
# - Database queries
# - Real-time data access
```

### Structured Output Prompting

Force the model to produce structured, parseable output. This is where "prompt engineering" becomes "systems engineering."

```python
# Structured output: force JSON with a schema
prompt = """Analyze the following request and return JSON with these fields:

{
  "intent": "string - what the user wants to do",
  "entities": [{"name": "string", "value": "string"}],
  "confidence": 0.0-1.0
}

Do NOT output anything else. Just the JSON object.

Request: {user_input}"""

# The key is being explicit about the schema
# and using the word "Just" to prevent extra text
# If the model still outputs markdown or explanatory text,
# you need a parser that extracts just the JSON part
```

### System Prompt vs User Prompt

The system prompt sets the behavior. The user prompt sets the task. Keep them separate.

```python
# System prompt: sets the model's behavior
system_prompt = """You are a helpful AI assistant that writes clear, concise technical documentation.
You always use bullet points when explaining multi-step processes.
You always include code examples when relevant.
You never use filler words or hedging.
"""

# User prompt: sets the specific task
user_prompt = """Write a tutorial on how to set up a local RAG pipeline with Python.
Include:
1. Prerequisites
2. Step-by-step instructions
3. Code examples
"""

# Why separate system and user prompts:
# - System prompt: stable (rarely changes)
# - User prompt: dynamic (changes per request)
# - This separation lets you A/B test prompts without changing behavior
# - Some APIs support this natively (ChatGPT API, Claude API)
```

### Prompt Templates and Variable Injection

Prompt engineering at scale requires templated prompts with variable injection:

{% raw %}
```python
from jinja2 import Template

# Template prompt
template = Template("""You are a code reviewer for {language} projects.
Task: Review the following code and provide feedback.
Focus areas: {focus_areas}
Severity threshold: {severity}

Code:
{
```python
"""
def code_review(code: str, language: str, focus_areas: str, severity: str) -> dict:
    template = Template("""You are a code reviewer for {language} projects.
Task: Review the following code and provide feedback.
Focus areas: {focus_areas}
Severity threshold: {severity_threshold}

Code:
{text}

Provide feedback in the following JSON format:
{{
  "overall_rating": 1-10,
  "issues": [
    {{ "severity": "high|medium|low", "description": "...", "line": N }}
  ],
  "improvements": ["...", "..."]
}}
""")
    
    prompt = template.render(
        language=language,
        review(code=code)
"""

# This is how professional AI systems manage prompts
# Templates are versioned, tested, and deployed like code
{% endraw %}

### Common Prompt Patterns Cheat Sheet

| Pattern | Use Case | When to Use | Implementation |
|---------|----------|-------------|-------------|
| Zero-shot | Simple tasks, clear instructions | When the model already "knows" the task | Just the prompt |
| Few-shot | Consistent output format | When you need predictable formatting | Include 3-5 examples |
| Chain-of-Thought | Reasoning tasks, math | When the model needs to "think" | Add "Reason step by step:" |
| Self-Consistency | High-stakes decisions | When accuracy matters more than speed | Multiple CoT attempts, majority vote |
| ReAct | Tool use, planning | When the model needs to act or look up info | "Reason → Act → Observe" cycle |
| Structured Output | API integration | When you need to parse the output | JSON schema in the prompt |
| System prompt | Behavior control | Set once, use everywhere | Stable, doesn't change per request |
| Prompt template | Scale | When you have many similar requests | Jinja2/templating |

### Anti-Patterns

1. **Too many instructions**: If your prompt is 5000 words, it's not a prompt. It's a spec. Split it into a system prompt + user prompt.
2. **Asking for explanations when you need data**: "Explain the problem and how to fix it" → "Return fix as JSON {field1, field2}"
3. **Forcing the model to guess**: "What's the best answer?" → "Pick from these options: A, B, C, D"
4. **Over-engineering prompts**: If a zero-shot prompt works, don't add CoT. If CoT works, don't add self-consistency.
5. **Ignoring the model's strengths**: Don't ask a model good at math to write poetry. Use the right model for the task.

### Summary

Prompt engineering is a practical discipline:
- Zero-shot is the default. Few-shot when you need consistency.
- CoT for reasoning. Self-consistency for high-accuracy tasks.
- ReAct for tool use. Structured output for API integration.
- Always separate system prompt (behavior) from user prompt (task).
- Template everything. Version everything. Track performance.

Build prompts like you build code: test, version, and measure their effectiveness. Don't "tweak" them. Engineer them.
