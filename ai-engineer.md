---
layout: post
title: AI Engineer
permalink: /ai-engineer/
---

# AI Engineering

Deep dive into AI engineering — architecture, infrastructure, and practical guides for building, deploying, and maintaining AI systems.

{% assign sections = "ai-blog:Blog,ai-notebooks:Notebooks,ai-slides:Slides,ai-cheat-sheets:Cheat sheets,ai-infographics:Infographics,ai-social-posts:Social posts,ai-podcasts:Podcasts,ai-videos:Videos,ai-memes:Memes" | split: "," %}
{% for section in sections %}
  {% assign pair = section | split: ":" %}
  {% assign collection_name = pair[0] %}
  {% assign label = pair[1] %}
  {% assign items = site[collection_name] | sort: 'date' | reverse %}
  {% if items.size > 0 %}
## {{ label }}

<div class="blog-list">
  {% for post in items limit:10 %}
  <article>
    <time datetime="{{ post.date | date_to_xmlschema }}">{{ post.date | date: "%d %b, %Y" }}</time>
    — <a href="{{ post.url | relative_url }}">{{ post.title }}</a>
  </article>
  {% endfor %}
</div>
  {% endif %}
{% endfor %}
