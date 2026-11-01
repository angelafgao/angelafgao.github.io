---
layout: page
title: Research
permalink: /Research/
---

My research develops methods for imaging problems where measurements are indirect, noisy, or incomplete, and where the forward model itself may be uncertain. I combine physics-based models with deep generative models to uncover hidden structure in data, with applications from seismic tomography to black hole imaging. My PhD thesis, [*Uncovering Hidden Structure in Data and the Physical World for Seismic Tomography and Beyond*](https://thesis.library.caltech.edu/18608/), brings this work together.

## Open Source Packages

- [ehtim tutorial](https://github.com/helloquat/ehtim-tutorial), led by [Yvette Lin](https://github.com/helloquat): how to use the [ehtim](https://achael.github.io/eht-imaging/) package to simulate your own black hole measurements.

## Projects

{% for project in site.data.research.current %}{% include project.html project=project %}{% endfor %}

## Earlier Research

{% for project in site.data.research.earlier %}{% include project.html project=project %}{% endfor %}
