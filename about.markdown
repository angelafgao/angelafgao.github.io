---
layout: page
title: About
permalink: /about/
---

Here are some photos of the places I've been and the things I've made.

{% include clothesline.html label="Places" items=site.data.gallery.places polaroid=true hide_label=true %}

{% include clothesline.html label="Silk" items=site.data.gallery.silk %}
{% include clothesline.html label="Watercolor" items=site.data.gallery.watercolor %}

<script src="{{ '/assets/js/clothesline.js' | relative_url }}" defer></script>
