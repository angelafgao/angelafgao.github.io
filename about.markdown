---
layout: page
title: About
permalink: /about/
---

Here are some photos of the places I've been and the things I've made.

<p class="hint">Brush past them, or click one for a closer look.</p>

## Places

{% include clothesline.html label="Places" items=site.data.gallery.places polaroid=true hide_label=true %}

## Paintings

{% include clothesline.html label="Watercolor" items=site.data.gallery.watercolor %}
{% include clothesline.html label="Silk" items=site.data.gallery.silk %}

<script src="{{ '/assets/js/clothesline.js' | relative_url }}" defer></script>
