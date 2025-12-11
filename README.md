# Music Note Runner! 🎵

A modern, interactive sheet music visualization and playback application that parses MusicXML files and displays them as scrolling sheet music with real-time note highlighting, audio playback, and multiple scroll modes.

## 🚀 Quick Start

1. Open `sheet-music-roll-local-vexflow.html` in a modern web browser
2. Click "📄 Upload Song" and select a MusicXML file (.xml, .musicxml, or .mxl)
3. Click "Start" to begin playback
4. Use keyboard shortcuts for quick control (see below)

**No installation or build process required!** Just open the HTML file and it works.

## ⌨️ Keyboard Shortcuts

- **Space**: Play/Pause
- **R**: Reset playback
- **S**: Toggle sound on/off
- **←Left Arrow - RightArrow→**: Adjust tempo (when not playing)

## 🎯 Key Features

- **Three Scroll Modes**: Smooth, Jump (measure-by-measure), and Center
- **Real-time Audio**: Tone.js synthesizer plays notes as they're highlighted
- **Customizable Highlighting**: Color picker for note highlighting
- **Progress Tracking**: Visual progress bar and note count
- **Responsive Design**: Works on desktop, tablet, and mobile
- **Error Handling**: Comprehensive validation and user-friendly error messages
- **Edge Case Handling**: Handles large files, malformed XML, empty files, etc.

## 😅 Challenges

I hadn't used Vexflow before so I had to watch a few videos and read some articles on it to gain familiarity with it.
Additionally, understanding the functionality, it took a while to decipher that the scrolling was pixel based and not scrolling based on the actual beats.

I was debating with scaffolding out a framework like Nuxt/Next in order to build it more robustly. 
It would've helped with built-in typescript safety as well as a greater separation but ultimately decided it would waste time and increase complexity. 
Working in a big 1700 line would not be the case in an actual job, there would be a bunch of modular files to prevent code breaking frequently.
This version works offline, and submits it back to you in the format it was given in.

Deciding on what scroll modes to use as well as reasoning. I decided to research and look at some of my DAWs and music games I had played in the past,
then used the help of an LLM to implement the design once I sketched it out.

Files with multiple staves only played one staff initially, so had to write a function to detect unique staff numbers per part.


## 🐛 Bugs
Missing Validation
- original code would start running if no XML file present

Incomplete Error Handling
- Code for errors was quite generic saying things like "Parse Error" + message
- The edge cases now are a lot more specific as they allow for empty files, broken XML files, no notes. etc.

Beat-Based Animation System
- Initially it seemed that the scrolling was based on the pixel position on the screen. Opposed to using the beats/musical timing.
- This version scrolls based on the beat/BPM which also has better syncing with the audio and is more musically accurate.

Reset Function
- used to use "noteData.originalFill" which didn't existed anywhere
- Therefore colors were not restored, leaving the green on the screen. Poor UX.

Tempo Slider
- Could not adjust slider whilst playing, not good UX.

Canvas Viewing Issue
- the initial canvas didn't show the whole sheet, and so had to adjust to the viewport to show the entire thing


---

## 📝 Changes from Original Code

This section documents all the changes made from the original starter code and explains the reasoning behind each modification.

### 🎨 **1. Complete UI/UX Redesign**

- **Why**: 
The original design was functional but lacked the appeal needed to engage to a younger audience.
You guys mentioned that Duolingo was a big inspiration so I opted for the same font.
As well as using things like round corners, soft shadows and gradients to make it feel more child like.
I also changed the name of the app to "Music Note Runner" to make it sound like a game (akin to a 2D runner)
Use of Emojis is present to reflect familiarity with the iPad generation of Kids

**Files Changed**: 
- I separated the app into app.js / styles.css in order to separate concerns and make it easier ton follow.

### 🎨 **2. Color Picker for Highlighting**

**Why**: 
Allows customization which makes the game more personable. Additionally, this
makes the game more accessible as users may prefer different colors depending on their eyesight.
Allows users to choose colors that work better for their vision

### 🔊 **3. Audio Playback with Tone.js**

**Why**: 
I noticed that there was no sound coming out of the music roll. 
If the user is to use this as a guide, then hearing the correct sound of the notes/chords
would be extremely beneficial in gaining a deeper understanding of pitch and correctness with audio feedback.
This also makes it more engaging.

**Implementation**:
- Tone.js library integration
- Converts VexFlow note notation to Tone.js format
- Respects note durations (whole, half, quarter, eighth, sixteenth notes)

### 🎮 **4. Three Scroll Modes**

**Why**: 
I maintained the original smooth scroll. As well as creating a "jumping/center" options.
I believe the jump mode would allow users to practice measures more effectively as it focuses on a section till the next jump.
Especially at slower tempos.
Center feels the most "game" like. kinda like Guitar Hero.
As the green guideline appears, you know exactly how it is meant to sound, it also gives you more time either side of the guideline.
Different users prefer different viewing styles

### ⌨️ **5. Keyboard Shortcuts**

**Why**: 
Better accessiblity. Allows kids to quickly toggle sound, start/reset game without wasting time fiddling with a mouse.
Increases accessibility too.

**Shortcuts Added**:
- Space: Play/Pause
- R: Reset
- S: Toggle sound
- Arrow keys: Tempo adjustment

### 📊 **6. Progress Tracking**

**Why**: 
Creates deeper engagement and better understanding of where the user is at with the piece.

### 🎉 **7. Completion Celebration**

**Why**: 
Initially it would just stop. But this way has positive reinforcement which kids need.
Also taps into the idea of gamification which will help them practice more and stay engaged with the app. Feels more fun. 

### 🛡️ **8. Comprehensive Error Handling**

**Why**: 
Allows users to understand how/why things are going wrong. Reduces frustration and allows them to troubleshoot on their own.

### 📱 **9. Enhanced Responsive Design**

**Why**: 
Most mobile sites/apps are mobile first designed. This is in line with that.

### Libraries Used
- **VexFlow 4.2.5**: Music notation rendering
- **Tone.js 14.8.49**: Audio synthesis
- **xml-js 1.6.11**: XML parsing (available but primarily using DOMParser)
- **canvas-confetti 1.6.0**: Celebration animations
- **Nunito Font**: Typography (Google Fonts)

## 🎵 Enjoy Music Note Runner!
