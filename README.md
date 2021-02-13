# Portfolio: Gunnar Mein

Hello! 

Over time, this repository will contain copies of more and more of my code. For now, a lot of what you can find here are pointers to other repos that feature substantial contributions from me, in no particular order:

## 1. Work at Eastside Preparatory School

### Neutron simulation for a Fusor

As part of our 6-year Fusor project at EPS, we needed to answer the question of whether slight residual gaps between the blocks of paraffin used for the neutron shielding actually matter to our radiation exposure or not. JavaNeutrons is our third attempt at this simulation, this time written by me (with less than 1% of code contributed by a student). https://github.com/EastsidePreparatorySchool/FusorComputationalModeling/tree/master/JavaNeutrons.

### Scanning Electron Microscope control software

I convinced Eastside Prep to buy a 37-year-old SEM. We restored it, got it to work, and digitized its imaging. This repo here contains the code for both the Java control software and the high-speed Arduino Due scanning software, both written entirely by me: https://github.com/EastsidePreparatorySchool/SEMConsole

### SpaceCritters

Years ago in a programming class, we wanted to get our hands on a game called "critters", used in the CS142 class at the UW in Seattle. We could not find all the source code, so we decided to write our own - but more complicated. SpaceCritters is an agent-based simulation game on a two-dimensional "space". Players write agents to run in the game. You can find a description at the public distribution point for the game: https://github.com/EastsidePreparatorySchool/SpaceCritters. The code, which is 85% mine in a cooperation with two students at school, is at https://github.com/EastsidePreparatorySchool/Ephemera.

### "Compilers" seminar

The "compilers" seminar at EPS is actually my own IP, developed on my own time, and hosted on the EPS GitHub only to provide convenient access to the students. There is one bit of it, the JVM code emitter, which is owned by Jackson Fellows, an exceptional student who wrote this part while he took the seminar. The rest is all mine. I will run this seminar again in March. As a teacher, this is perhaps the work I am most proud of. https://github.com/EastsidePreparatorySchool/Compilers.

### LaserCut

LaserCut is a utility to feed simple DXF files directly to a LaserCutter, with correct dimensions, without having to go through the usual PDF conversion. It is a minor work, but I include it here to demonstrate that I am comfortable in interfacing Java with elementary C++. https://github.com/EastsidePreparatorySchool/LaserCut


## 2. Selected work in the UC Masters of Information and Data Science program:

### FireBERT

FireBERT is an attempt to harden BERT-based classifiers against adversarial attack by the program "TextFooler". It is a cooperation with Kevin Hartman and Andrew Morris. Our paper can be found at https://arxiv.org/abs/2008.04203. It will be presented at FICC 2021 in April, and published by Springer. All code and data for this project can be found at https://github.com/FireBERT-NLP/FireBERT. I am the lead author on the paper, personally wrote the code for the FIVE and FUSE classifiers, and shepherded the paper through publication. Classifiers are written in Python/PyTorch. 

### Rote memorization experiment

As part of the w241 class on field experiments, I conducted an experiment (with two other students) and built a website (this is my work) in Java/HTML/CSS/JavaScript, to assess the effectiveness of alternative forms of rote memorization. This should not be taken as serious psychological or pedagogical research, but rather as a demonstration of how to cost-effectily run an experiment with 100 subjects. The code is at https://github.com/gunnarmein-ucbischool/w241-rote. The final paper is at https://github.com/gunnarmein-ucbischool/w241-rote/blob/master/Analysis/TinaHuang_JeffLi_GunnarMein_Final.pdf. I was the instigator and lead author of this project. 

###  CDC TowerScout

TowerScout is the MIDS capstone project I am working on with three peers. I am responsible for the design and coding of the inference app - a web-hosted app running the YOLOv5 detector inside a Python/Flask/Waitress web server, along with an HTML/CSS/JavaScript client. This project will solve a real need: TowerScout will enable the CDC to efficiently identify cooling towers on rooftops - an essential part of investigating outbreaks of legionella. We have been through 2 reviews with the CDC teams that will be using this, and they are very exceited. Far beyond your typical data sience capstone project, this application requires robustness, performance, and a passable workflow UI in order to be used by multiple CDC investigators concurrently during outbreak investigations. My current snapshot of my work is hosted here in this repo, but will be replaced by a link to our complete work when it is finished in early April. See the code at https://github.com/gunnarmein-ucbischool/portfolio/TowerScout.






