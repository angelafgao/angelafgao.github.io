---
layout: home
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
