---
layout: home
footer_animation: none
---

<div class="intro">
<img src="/assets/profile.jpg" alt="Angela Gao" class="profile">
<div markdown="1">

I am currently the CTO/cofounder of [Fearn](https://fearn.ai). Previously, I received my PhD in [Computing and Mathematical Sciences](https://www.cms.caltech.edu/) from [Caltech](https://www.caltech.edu/), where I had the pleasure of being advised by [Professor Katie Bouman](https://users.cms.caltech.edu/~klbouman/). Before that, I received a B.S. in Electrical and Computer Engineering with an additional major in Biomedical Engineering from [Carnegie Mellon University](https://www.cmu.edu/).

Click [here](/assets/Angela_Gao_CV_F23.pdf) for a PDF of my CV.

</div>
</div>

<div class="selected-pubs">
<h2 id="selected-publications">Selected Publications</h2>
{% assign selected = site.data.publications | where_exp: "pub", "pub.selected" | sort: "selected" %}
{% for pub in selected %}{% include publication.html pub=pub %}{% endfor %}
<p>* denotes equal contribution. <a href="/Publications/">All publications →</a></p>
</div>

{% comment %} Movable stamps (assets/js/stamp-drag.js): each holder needs a unique data-stamp-key. {% endcomment %}
<div class="stamp-tray" data-stamp-tray>
<span class="stamp-holder" data-stamp-key="caltech">{% include stamp.html shape="circle" top="Caltech" big="PhD" label="Graduated" bottom="Pasadena, CA" tilt="-6" size="190" seed="3" %}</span>
<span class="stamp-holder" data-stamp-key="neurips">{% include stamp.html shape="oval" top="Published" big="NeurIPS" bottom="2021" tilt="4" size="200" seed="27" %}</span>
<span class="stamp-holder" data-stamp-key="cmu">{% include stamp.html shape="rect" top="Carnegie Mellon" big="B.S." label="ECE + BME" bottom="Class of 2018" tilt="3" size="230" seed="8" %}</span>
<span class="stamp-holder" data-stamp-key="eht">{% include stamp.html shape="oval" top="Psst" big="eht" label="Type it" bottom="Anywhere" ink="chartreuse" tilt="5" size="190" seed="21" %}</span>
<span class="stamp-holder" data-stamp-key="fearn">{% include stamp.html shape="oval" top="Fearn" big="CTO" label="Cofounder" tilt="-2" size="210" seed="14" %}</span>
</div>
