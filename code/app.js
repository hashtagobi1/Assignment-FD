// Wait for VexFlow to load with extended timeout for CDN
window.addEventListener('load', function () {
    // Give the CDN more time to load (1 second for slower connections)
    setTimeout(function () {
        if (typeof Vex === 'undefined') {
            // Try again after another second
            setTimeout(initApp, 1000);
        } else {
            initApp();
        }
    }, 1000);
});

function initApp() {
    // Check if VexFlow loaded
    if (typeof Vex === 'undefined' && typeof VexFlow === 'undefined') {
        showStatus('VexFlow not loaded. Please check setup instructions in HTML file.', 'error');
        console.error('VexFlow not found. Make sure vexflow.js is in the same folder or use a working CDN.');
        return;
    }

    console.log('VexFlow loaded successfully!');
    showStatus('VexFlow loaded! Ready to render music.', 'success');

    // Get VexFlow classes
    const VF = window.Vex?.Flow || window.VexFlow;
    const { Renderer, Stave, StaveNote, Voice, Formatter, Accidental, StaveConnector, Beam, Annotation, Articulation, Curve } = VF;

    // Music data - now supports multiple staves/clefs
    let musicData = {
        keySignature: 'C',
        timeSignature: '4/4',
        parts: [] // Array of {clef, notes[]}
    };

    let isPlaying = false;
    let bpm = 100;
    let scrollPos = 0;
    let animationId = null;
    let lastTime = Date.now();
    let noteElements = [];
    let renderer = null;
    let context = null;
    // NEW: Scrolling mode state
    let scrollMode = 'smooth'; // 'smooth', 'jumping', or 'center'
    let currentMeasureIndex = 0;
    let measuresData = []; // Store measure boundaries for jumping mode
    // Color Pocker
    let highlightColor = '#2ecc71'; // Default green
    let soundEnabled = false;
    let synth = null;
    let lastPlayedNoteIndex = -1;

    // Parse MusicXML using xml-js library for robust parsing
    function parseMusicXML(xmlText) {
        try {
            showStatus('Parsing MusicXML with xml-js parser...', 'success');

            // Convert XML to JSON for easier parsing
            const jsonData = xml2js(xmlText, { compact: true, spaces: 2 });
            console.log('📋 MusicXML parsed to JSON structure');

            // Also use DOMParser for querySelector convenience
            const parser = new DOMParser();
            const xmlDoc = parser.parseFromString(xmlText, 'text/xml');


            // Work / piece title:
            const workTitle =
                xmlDoc.querySelector('work > work-title')?.textContent?.trim() ||
                xmlDoc.querySelector('movement-title')?.textContent?.trim() ||
                'Untitled Piece';
            // Composer:
            //  - fall back to first <creator> if no type="composer"
            let composer = 'Unknown composer';

            const creatorNodes = Array.from(
                xmlDoc.querySelectorAll('identification > creator')
            );

            const composerNode =
                creatorNodes.find(
                    (c) => (c.getAttribute('type') || '').toLowerCase() === 'composer'
                ) || creatorNodes[0];

            if (composerNode && composerNode.textContent) {
                composer = composerNode.textContent.trim();
            }

            // store in musicData if you like
            musicData.workTitle = workTitle;
            musicData.composer = composer;

            // update UI
            const workTitleEl = document.getElementById('workTitle');
            const composerEl = document.getElementById('composerName');

            if (workTitleEl) workTitleEl.textContent = workTitle;
            if (composerEl) composerEl.textContent = `by ${composer}`;

            // Extract key signature (global)
            const fifths = parseInt(xmlDoc.querySelector('key fifths')?.textContent) || 0;
            const keyMap = {
                '-7': 'Cb', '-6': 'Gb', '-5': 'Db', '-4': 'Ab', '-3': 'Eb', '-2': 'Bb', '-1': 'F',
                '0': 'C', '1': 'G', '2': 'D', '3': 'A', '4': 'E', '5': 'B', '6': 'F#', '7': 'C#'
            };
            musicData.keySignature = keyMap[fifths.toString()] || 'C';

            // Extract time signature (global)
            const beats = xmlDoc.querySelector('time beats')?.textContent || '4';
            const beatType = xmlDoc.querySelector('time beat-type')?.textContent || '4';
            musicData.timeSignature = `${beats}/${beatType}`;

            console.log(`🎼 Key: ${musicData.keySignature}, Time: ${musicData.timeSignature}`);

            musicData.parts = [];

            // Get ALL parts (treble and bass for piano)
            const parts = xmlDoc.querySelectorAll('part');
            console.log(`📚 Found ${parts.length} part(s) in MusicXML`);

            parts.forEach((part, partIdx) => {
                // Get divisions for this part
                const divisions = parseInt(part.querySelector('divisions')?.textContent) || 4;

                // Check if this part has multiple staves (common in piano music)
                const allClefs = part.querySelectorAll('clef');
                const uniqueStaves = new Set();
                allClefs.forEach(clef => {
                    const staffNum = clef.getAttribute('number') || '1';
                    uniqueStaves.add(staffNum);
                });

                console.log(`  📄 Part ${partIdx + 1} has ${uniqueStaves.size} stave(s)`);

                // If multiple staves, parse them separately
                if (uniqueStaves.size > 1) {
                    // Piano part with multiple staves
                    Array.from(uniqueStaves).sort().forEach(staffNum => {
                        const clefForStaff = part.querySelector(`clef[number="${staffNum}"]`) || part.querySelector('clef');
                        const clefSign = clefForStaff?.querySelector('sign')?.textContent || 'G';
                        const clefLine = clefForStaff?.querySelector('line')?.textContent || '2';

                        let clef = 'treble';
                        if (clefSign === 'G' && clefLine === '2') {
                            clef = 'treble';
                        } else if (clefSign === 'F' && clefLine === '4') {
                            clef = 'bass';
                        } else if (clefSign === 'C') {
                            clef = clefLine === '3' ? 'alto' : 'tenor';
                        } else if (clefSign === 'F') {
                            clef = 'bass';
                        }

                        console.log(`    🎼 Staff ${staffNum}: ${clef} clef (${clefSign}/${clefLine})`);
                        parseStaff(part, staffNum, clef, divisions, partIdx, uniqueStaves, xmlDoc);
                    });
                } else {
                    // Single staff part
                    const clefSign = part.querySelector('clef sign')?.textContent || 'G';
                    const clefLine = part.querySelector('clef line')?.textContent || '2';

                    let clef = 'treble';
                    if (clefSign === 'G' && clefLine === '2') {
                        clef = 'treble';
                    } else if (clefSign === 'F' && clefLine === '4') {
                        clef = 'bass';
                    } else if (clefSign === 'C') {
                        clef = clefLine === '3' ? 'alto' : 'tenor';
                    } else if (clefSign === 'F') {
                        clef = 'bass';
                    }

                    console.log(`  🎼 Part ${partIdx + 1}: ${clef} clef (${clefSign}/${clefLine})`);
                    const singleStave = new Set(['1']);
                    parseStaff(part, '1', clef, divisions, partIdx, singleStave, xmlDoc);
                }
            });

            // Helper function to parse a staff
            function parseStaff(part, staffNum, clef, divisions, partIdx, uniqueStaves, xmlDoc) {
                const partNotes = [];
                let currentTime = 0;

                // Parse measures in this part - filter by staff number AND handle CHORDS
                const measures = part.querySelectorAll('measure');
                const measureDirections = []; // Store tempo/dynamic markings per measure

                measures.forEach((measure, measureIdx) => {
                    // Check for direction elements (tempo, dynamics text, etc.)
                    const directions = measure.querySelectorAll('direction');
                    directions.forEach(dir => {
                        const dirStaff = dir.querySelector('staff')?.textContent || '1';
                        if (dirStaff === staffNum) {
                            const words = dir.querySelector('direction-type words');
                            if (words) {
                                const text = words.textContent;
                                const placement = dir.getAttribute('placement') || 'above';
                                measureDirections.push({
                                    measure: measureIdx,
                                    text: text,
                                    placement: placement,
                                    time: currentTime
                                });
                            }
                        }
                    });

                    const noteElements = measure.querySelectorAll('note');

                    noteElements.forEach(noteEl => {
                        // Check if note belongs to this staff
                        const noteStaff = noteEl.querySelector('staff')?.textContent || '1';
                        if (noteStaff !== staffNum) return;

                        const duration = parseInt(noteEl.querySelector('duration')?.textContent) || divisions;
                        const noteDuration = duration / divisions;

                        // Handle rests
                        if (noteEl.querySelector('rest')) {
                            currentTime += noteDuration;
                            return;
                        }

                        const pitch = noteEl.querySelector('pitch');
                        if (!pitch) return;

                        const step = pitch.querySelector('step')?.textContent;
                        const octave = pitch.querySelector('octave')?.textContent;
                        const alter = pitch.querySelector('alter')?.textContent;

                        if (!step || !octave) return;

                        let noteName = step.toLowerCase() + '/' + octave;
                        let accidental = null;

                        if (alter === '1') {
                            accidental = '#';
                            noteName = step.toLowerCase() + '#/' + octave;
                        } else if (alter === '-1') {
                            accidental = 'b';
                            noteName = step.toLowerCase() + 'b/' + octave;
                        }

                        // Convert duration to VexFlow notation
                        let noteType = 'q';
                        if (noteDuration >= 4) noteType = 'w';
                        else if (noteDuration >= 2) noteType = 'h';
                        else if (noteDuration >= 1) noteType = 'q';
                        else if (noteDuration >= 0.5) noteType = '8';
                        else if (noteDuration >= 0.25) noteType = '16';

                        // Check if this is a CHORD (multiple notes at same time)
                        const isChord = noteEl.querySelector('chord') !== null;

                        if (isChord && partNotes.length > 0) {
                            // Add to previous note's keys (making it a chord)
                            const prevNote = partNotes[partNotes.length - 1];
                            prevNote.keys.push(noteName);
                            if (accidental) {
                                prevNote.accidentals = prevNote.accidentals || [];
                                prevNote.accidentals.push({ key: prevNote.keys.length - 1, accidental: accidental });
                            }
                            console.log(`    🎵 Added to chord: ${noteName}`);
                        } else {
                            // New note - check for dynamics and articulations
                            const newNote = {
                                keys: [noteName],
                                duration: noteType,
                                accidental: accidental,
                                time: currentTime
                            };

                            // Check for dynamics (pp, p, mp, mf, f, ff, etc.)
                            const dynamics = noteEl.querySelector('notations dynamics');
                            if (dynamics) {
                                const dynamicType = dynamics.querySelector('*')?.tagName?.toLowerCase();
                                if (dynamicType) {
                                    newNote.dynamic = dynamicType;
                                }
                            }

                            // Check for articulations (staccato, accent, etc.)
                            const articulations = noteEl.querySelector('notations articulations');
                            if (articulations) {
                                const articulationType = articulations.querySelector('*')?.tagName?.toLowerCase();
                                if (articulationType) {
                                    newNote.articulation = articulationType;
                                }
                            }

                            // Check for slurs
                            const slur = noteEl.querySelector('notations slur');
                            if (slur) {
                                newNote.slur = slur.getAttribute('type'); // start/stop/continue
                            }

                            partNotes.push(newNote);
                            currentTime += noteDuration;
                        }
                    });
                });

                // Get part name if available
                const partId = part.getAttribute('id') || `P${partIdx + 1}`;
                const partNameEl = xmlDoc.querySelector(`score-part[id="${partId}"] part-name`);
                const partName = partNameEl?.textContent || `Part ${partIdx + 1}`;
                const staffName = uniqueStaves.size > 1 ? `${partName} Staff ${staffNum}` : partName;

                musicData.parts.push({
                    id: `${partId}_${staffNum}`,
                    name: staffName,
                    clef: clef,
                    notes: partNotes,
                    directions: measureDirections
                });

                console.log(`      ✅ Parsed ${partNotes.length} notes and ${measureDirections.length} directions from "${staffName}"`);
            }

            const totalNotes = musicData.parts.reduce((sum, p) => sum + p.notes.length, 0);

            console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');
            console.log(`✅ PARSING COMPLETE`);
            console.log(`   Total staves: ${musicData.parts.length}`);
            musicData.parts.forEach((p, i) => {
                console.log(`   ${i + 1}. ${p.name} (${p.clef}): ${p.notes.length} notes`);
            });
            console.log(`   Total notes: ${totalNotes}`);
            console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');

            renderMusic();
            showStatus(`Loaded ${totalNotes} notes from ${musicData.parts.length} stave(s)!`, 'success');
            document.getElementById('noteCount').textContent = `0 / ${totalNotes}`;

        } catch (e) {
            showStatus('Parse error: ' + e.message, 'error');
            console.error(e);
        }
    }

    // Render music with VexFlow - BOTH treble and bass clefs!
    function renderMusic() {
        const container = document.getElementById('musicCanvas');
        container.innerHTML = '';
        // Reset Data to prevent stale data reuse
        measuresData = [];
        currentMeasureIndex = 0;
        scrollPos = 0;
        document.getElementById('scrollWrapper').style.transform = 'translateX(0px)';

        if (!musicData.parts || musicData.parts.length === 0) {
            showStatus('No parts found in MusicXML', 'error');
            return;
        }

        console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');
        console.log('🎵 RENDERING MUSIC COMPONENTS');
        console.log(`Total Parts: ${musicData.parts.length}`);

        // Group by clef type to show summary
        const clefCounts = {};
        musicData.parts.forEach((part, idx) => {
            clefCounts[part.clef] = (clefCounts[part.clef] || 0) + 1;
            console.log(`  Part ${idx + 1}: "${part.name}" - ${part.clef} clef (${part.notes.length} notes)`);
        });

        console.log('Clef distribution:', Object.entries(clefCounts).map(([clef, count]) => `${count}× ${clef}`).join(', '));
        console.log('Key:', musicData.keySignature);
        console.log('Time:', musicData.timeSignature);
        console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');

        try {
            // Duration to beat mapping
            const durationToBeats = {
                'w': 4, 'h': 2, 'q': 1, '8': 0.5, '16': 0.25
            };

            // Group notes into measures for EACH part
            const partMeasures = musicData.parts.map(part => {
                const measures = [];
                let currentMeasure = [];
                let currentBeats = 0;
                const beatsPerMeasure = 4;

                part.notes.forEach(noteData => {
                    const beats = durationToBeats[noteData.duration] || 1;

                    if (currentBeats + beats > beatsPerMeasure && currentMeasure.length > 0) {
                        measures.push(currentMeasure);
                        currentMeasure = [];
                        currentBeats = 0;
                    }

                    currentMeasure.push(noteData);
                    currentBeats += beats;

                    if (currentBeats >= beatsPerMeasure) {
                        measures.push(currentMeasure);
                        currentMeasure = [];
                        currentBeats = 0;
                    }
                });

                if (currentMeasure.length > 0) {
                    measures.push(currentMeasure);
                }

                return measures;
            });

            const maxMeasures = Math.max(...partMeasures.map(m => m.length));

            console.log(`📊 ${musicData.parts.length} part(s) grouped into ${maxMeasures} measures`);
            console.log('🎨 Using variable-width measures for proper musical spacing');

            // Calculate variable stave widths based on note content
            const calculateStaveWidth = (measureNotes) => {
                // Base width + spacing per note
                const baseWidth = 80;
                const noteSpacing = 40;
                return Math.max(180, baseWidth + (measureNotes.length * noteSpacing));
            };

            // Calculate total width needed
            let totalWidth = 100;
            const stavesHeight = 100;
            const canvasHeight = (musicData.parts.length * stavesHeight) + 100;

            // Pre-calculate all stave widths (use max width across all parts for alignment)
            const staveWidths = [];
            for (let measureIdx = 0; measureIdx < maxMeasures; measureIdx++) {
                let maxWidth = 180;
                partMeasures.forEach(measures => {
                    if (measures[measureIdx]) {
                        const width = calculateStaveWidth(measures[measureIdx]);
                        maxWidth = Math.max(maxWidth, width);
                    }
                });
                staveWidths.push(maxWidth);
                totalWidth += maxWidth;
            }

            console.log(`📏 Calculated ${staveWidths.length} measure widths: ${staveWidths.slice(0, 5).map(w => Math.round(w)).join(', ')}${staveWidths.length > 5 ? '...' : ''}`);

            // Create renderer
            renderer = new Renderer(container, Renderer.Backends.SVG);
            renderer.resize(totalWidth, canvasHeight);
            context = renderer.getContext();
            context.setFont('Arial', 10);

            noteElements = [];
            let globalNoteIndex = 0;
            const allStaves = []; // Store staves to connect them

            // Render each part (treble, then bass)
            musicData.parts.forEach((part, partIdx) => {
                const yPosition = 60 + (partIdx * stavesHeight);
                let x = 150; // Fixed starting position for consistency

                const measures = partMeasures[partIdx];
                const partStaves = [];

                // Render each measure for this part
                measures.forEach((measureNotes, measureIdx) => {

                    const staveWidth = staveWidths[measureIdx];
                    const stave = new Stave(x, yPosition, staveWidth);

                    // First measure gets clef, key, time signature
                    if (measureIdx === 0) {
                        stave.addClef(part.clef);
                        stave.addKeySignature(musicData.keySignature);
                        stave.addTimeSignature(musicData.timeSignature);

                        // Add tempo/direction text on first measure
                        if (part.directions && part.directions.length > 0) {
                            part.directions.filter(d => d.measure === 0).forEach(dir => {
                                // VexFlow positions: 1=ABOVE, 2=BELOW
                                const position = dir.placement === 'above' ? 1 : 2;
                                const yShift = dir.placement === 'above' ? -10 : 10;
                                stave.setText(dir.text, position, { shift_y: yShift });
                            });
                        }
                    }

                    stave.setContext(context).draw();

                    // Store stave for connecting later
                    partStaves.push(stave);

                    if (partIdx === 0) {
                        measuresData.push({
                            index: measureIdx,
                            xStart: x,
                            xEnd: x + staveWidth,
                            width: staveWidth
                        });
                    }

                    // Create StaveNote components for this measure
                    const staveNotes = [];
                    measureNotes.forEach((noteData, idx) => {
                        const isChord = noteData.keys.length > 1;
                        console.log(`📝 "${part.name}" (${part.clef}) - M${measureIdx + 1}, Note #${globalNoteIndex + 1}:`,
                            isChord ? `CHORD [${noteData.keys.join(', ')}]` : noteData.keys[0],
                            noteData.duration);

                        // Sort keys for chords (VexFlow requires bottom to top)
                        const sortedKeys = [...noteData.keys].sort((a, b) => {
                            // Extract note and octave for proper sorting
                            const [noteA, octaveA] = a.split('/');
                            const [noteB, octaveB] = b.split('/');
                            const octaveDiff = parseInt(octaveA) - parseInt(octaveB);
                            if (octaveDiff !== 0) return octaveDiff;

                            // If same octave, sort by note
                            const noteOrder = ['c', 'd', 'e', 'f', 'g', 'a', 'b'];
                            const cleanA = noteA.replace(/[#b]/g, '');
                            const cleanB = noteB.replace(/[#b]/g, '');
                            return noteOrder.indexOf(cleanA) - noteOrder.indexOf(cleanB);
                        });

                        // Create note component (handles both single notes and chords)
                        const staveNote = new StaveNote({
                            keys: sortedKeys,
                            duration: noteData.duration,
                            clef: part.clef
                        });

                        // Add accidentals for chords
                        if (noteData.accidentals && noteData.accidentals.length > 0) {
                            noteData.accidentals.forEach(acc => {
                                staveNote.addModifier(new Accidental(acc.accidental), acc.key);
                            });
                        } else if (noteData.accidental) {
                            // Single note accidental
                            staveNote.addModifier(new Accidental(noteData.accidental), 0);
                        }

                        // Add dynamics (pp, p, mp, mf, f, ff, etc.)
                        if (noteData.dynamic) {
                            const dynamicText = noteData.dynamic.toUpperCase();
                            staveNote.addModifier(new Annotation(dynamicText)
                                .setVerticalJustification(Annotation.VerticalJustify.BOTTOM)
                                .setFont('Times', 12, 'italic'));
                        }

                        // Add articulations (staccato, accent, tenuto, etc.)
                        if (noteData.articulation) {
                            const articulationMap = {
                                'staccato': 'a.',
                                'accent': 'a>',
                                'tenuto': 'a-',
                                'staccatissimo': 'av',
                                'marcato': 'a^'
                            };
                            const artCode = articulationMap[noteData.articulation];
                            if (artCode) {
                                staveNote.addModifier(new Articulation(artCode));
                            }
                        }

                        staveNotes.push(staveNote);

                        // Store reference to THIS specific note component
                        // X position will be updated after formatting
                        noteElements.push({
                            note: staveNote,
                            time: noteData.time,
                            x: x, // Temporary, will be updated with actual position
                            y: yPosition,
                            staveIndex: measureIdx,
                            partIndex: partIdx,
                            partName: part.name,
                            noteIndex: globalNoteIndex,
                            clef: part.clef,
                            slur: noteData.slur,
                            dynamic: noteData.dynamic,
                            articulation: noteData.articulation
                        });

                        globalNoteIndex++;
                    });

                    // Format and draw the notes with ACCURATE spacing
                    if (staveNotes.length > 0) {
                        const voice = new Voice({ num_beats: 4, beat_value: 4 });
                        voice.setMode(Voice.Mode.SOFT); // Use SOFT mode for flexibility with chords

                        try {
                            voice.addTickables(staveNotes);

                            // Auto-beam 8th and 16th notes
                            const beamGroups = Beam.generateBeams(staveNotes, {
                                beam_rests: false,
                                maintain_stem_directions: true
                            });

                            // Use formatter with proportional spacing based on duration
                            const formatter = new Formatter();
                            const formatterWidth = staveWidth - 40;

                            // Format voices with proportional spacing
                            formatter.joinVoices([voice]).formatToStave([voice], stave, {
                                align_rests: true
                            });

                            voice.draw(context, stave);

                            // Draw beams
                            beamGroups.forEach(beam => beam.setContext(context).draw());

                            // Draw slurs/curves for this measure
                            let slurStart = null;
                            measureNotes.forEach((noteData, idx) => {
                                if (noteData.slur === 'start') {
                                    slurStart = idx;
                                } else if (noteData.slur === 'stop' && slurStart !== null) {
                                    // Draw curve from slurStart to current note
                                    const curve = new Curve(
                                        staveNotes[slurStart],
                                        staveNotes[idx],
                                        {
                                            cps: [
                                                { x: 0, y: 10 },
                                                { x: 0, y: 10 }
                                            ]
                                        }
                                    );
                                    curve.setContext(context).draw();
                                    slurStart = null;
                                }
                            });

                            // Update note positions with actual rendered positions
                            staveNotes.forEach((staveNote, idx) => {
                                const noteX = staveNote.getAbsoluteX();
                                const noteElement = noteElements[noteElements.length - staveNotes.length + idx];
                                if (noteElement) {
                                    noteElement.x = noteX;
                                }
                            });
                        } catch (e) {
                            console.error('Error formatting measure:', e);
                        }
                    }

                    x += staveWidth;
                });

                allStaves.push(partStaves);
            });

            // Connect staves with brace for piano grand staff (if 2 parts)
            if (musicData.parts.length === 2 && allStaves.length === 2) {
                console.log('🎹 Adding piano grand staff connectors');
                const numMeasures = Math.min(allStaves[0].length, allStaves[1].length);

                for (let i = 0; i < numMeasures; i++) {
                    if (allStaves[0][i] && allStaves[1][i]) {
                        // Add brace on first measure only
                        if (i === 0) {
                            const brace = new StaveConnector(allStaves[0][i], allStaves[1][i]);
                            brace.setType(StaveConnector.type.BRACE);
                            brace.setContext(context).draw();
                        }

                        // Add line connectors for all measures
                        const lineLeft = new StaveConnector(allStaves[0][i], allStaves[1][i]);
                        lineLeft.setType(StaveConnector.type.SINGLE_LEFT);
                        lineLeft.setContext(context).draw();

                        const lineRight = new StaveConnector(allStaves[0][i], allStaves[1][i]);
                        lineRight.setType(StaveConnector.type.SINGLE_RIGHT);
                        lineRight.setContext(context).draw();
                    }
                }
            }

            console.log(`✅ Successfully rendered ${noteElements.length} individual note components across ${maxMeasures} measures in ${musicData.parts.length} part(s)`);

            // NOW extract the SVG elements for each note
            extractNoteSVGElements();

            // Position guide line dynamically based on rendered content
            positionGuideLine();

        } catch (e) {
            showStatus('Render error: ' + e.message, 'error');
            console.error(e);
        }
    }

    // Position the guide line dynamically based on rendered content
    function positionGuideLine() {
        const guideLine = document.querySelector('.guide-line');
        const canvas = document.getElementById('musicCanvas');
        const svg = canvas.querySelector('svg');

        if (!svg || noteElements.length === 0) {
            return;
        }

        // Position based on scroll mode
        if (scrollMode === 'center') {
            guideLine.classList.add('center-mode');
            guideLine.style.left = '50%';
        } else {
            guideLine.classList.remove('center-mode');

            const sampleSize = Math.min(8, Math.max(3, noteElements.length));
            const firstNotesX = noteElements.slice(0, sampleSize).map(n => n.x).filter(x => x > 0);

            if (firstNotesX.length > 0) {
                const firstNoteX = Math.min(...firstNotesX);
                const targetX = Math.round(firstNoteX - 20);
                guideLine.style.left = `${targetX}px`;
            } else {
                guideLine.style.left = '200px';
            }
        }
    }

    // Extract ALL SVG components for each note (notehead, stem, beam, flag, etc.)
    function extractNoteSVGElements() {
        const svg = document.querySelector('#musicCanvas svg');
        if (!svg) return;

        console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');
        console.log('🔗 EXTRACTING ALL NOTE COMPONENTS');

        // Find all note groups (VexFlow wraps each note in a g element)
        const noteGroups = svg.querySelectorAll('.vf-stavenote');
        console.log('Found', noteGroups.length, 'note groups in SVG');

        // Link each note group to our note elements
        noteGroups.forEach((noteGroup, idx) => {
            if (idx < noteElements.length) {
                // Store the entire note group (includes notehead, stem, beam, flag, accidentals)
                noteElements[idx].svgGroup = noteGroup;
                noteElements[idx].svgElement = noteGroup; // For compatibility

                // Get all child elements of this note
                const noteheads = noteGroup.querySelectorAll('.vf-notehead');
                const stems = noteGroup.querySelectorAll('.vf-stem');
                const flags = noteGroup.querySelectorAll('.vf-flag');
                const accidentals = noteGroup.querySelectorAll('.vf-accidental');
                const annotations = noteGroup.querySelectorAll('.vf-annotation');
                const articulations = noteGroup.querySelectorAll('.vf-articulation');

                noteElements[idx].components = {
                    noteheads: Array.from(noteheads),
                    stems: Array.from(stems),
                    flags: Array.from(flags),
                    accidentals: Array.from(accidentals),
                    annotations: Array.from(annotations),
                    articulations: Array.from(articulations)
                };

                // Store original colors
                noteElements[idx].originalColors = {
                    noteheads: Array.from(noteheads).map(n => n.getAttribute('fill') || '#000'),
                    stems: Array.from(stems).map(n => n.getAttribute('stroke') || '#000'),
                    flags: Array.from(flags).map(n => n.getAttribute('fill') || '#000'),
                    accidentals: Array.from(accidentals).map(n => n.getAttribute('fill') || '#000'),
                    annotations: Array.from(annotations).map(n => n.getAttribute('fill') || '#000'),
                    articulations: Array.from(articulations).map(n => n.getAttribute('fill') || '#000')
                };
            }
        });

        // Also find beams and slurs (they're separate from note groups)
        const beams = svg.querySelectorAll('.vf-beam');
        const curves = svg.querySelectorAll('.vf-curve');
        console.log('Found', beams.length, 'beams and', curves.length, 'slurs/curves');

        // Store beams and curves for highlighting
        window.allBeams = Array.from(beams).map(beam => ({
            element: beam,
            originalFill: beam.getAttribute('fill') || '#000'
        }));

        window.allCurves = Array.from(curves).map(curve => ({
            element: curve,
            originalStroke: curve.getAttribute('stroke') || '#000'
        }));

        console.log('✅ Extracted', noteElements.length, 'complete note components (noteheads, stems, beams, flags, slurs)');
        console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');
    }

    // Highlight ALL note components (noteheads, stems, beams, flags, accidentals)
    function highlightNotes() {
        if (noteElements.length === 0) return;

        const guideLine = document.querySelector('.guide-line');
        const guideRect = guideLine.getBoundingClientRect();
        const scrollWrapper = document.getElementById('scrollWrapper');
        const wrapperRect = scrollWrapper.getBoundingClientRect();

        let notesPlayed = 0;

        noteElements.forEach((noteData, index) => {
            if (!noteData.svgGroup || !noteData.components) return;

            // Calculate note position based on mode
            let noteWorldX;
            if (scrollMode === 'jumping') {
                // In jumping mode, use virtual scroll position
                noteWorldX = noteData.x - scrollPos;
            } else {
                // In smooth/center modes, use actual visual position
                noteWorldX = wrapperRect.left + noteData.x;
            }

            const distance = Math.abs(noteWorldX - guideRect.left);

            // Count notes that have passed the guide line
            if (scrollMode === 'jumping') {
                // Count based on virtual position
                if (noteData.x < scrollPos + (guideRect.left - wrapperRect.left)) {
                    notesPlayed++;
                }
            } else {
                if (noteWorldX < guideRect.left) {
                    notesPlayed++;
                }
            }

            if (soundEnabled && index > lastPlayedNoteIndex) {
                const justPassed = scrollMode === 'jumping'
                    ? (noteData.x < scrollPos + (guideRect.left - wrapperRect.left))
                    : (noteWorldX < guideRect.left);

                if (justPassed) {
                    playNote(noteData.note);
                    lastPlayedNoteIndex = index;
                }
            }



            // Highlight when note is near the guide line (within 50px)
            if (distance < 50) {
                // HIGHLIGHT ALL COMPONENTS OF THIS NOTE
                const glowColor = 'drop-shadow(0 0 8px rgba(46, 204, 113, 0.8))';

                // Highlight noteheads (can be multiple in chords)
                noteData.components.noteheads.forEach(notehead => {
                    notehead.setAttribute('fill', highlightColor);
                    notehead.setAttribute('stroke', highlightColor);
                });

                // Highlight stems
                noteData.components.stems.forEach(stem => {
                    stem.setAttribute('stroke', highlightColor);
                    stem.setAttribute('fill', highlightColor);
                });

                // Highlight flags
                noteData.components.flags.forEach(flag => {
                    flag.setAttribute('fill', highlightColor);
                });

                // Highlight accidentals
                noteData.components.accidentals.forEach(acc => {
                    acc.setAttribute('fill', highlightColor);
                });

                // Highlight annotations (dynamics text like pp, mf, ff)
                noteData.components.annotations.forEach(ann => {
                    ann.setAttribute('fill', highlightColor);
                });

                // Highlight articulations (staccato, accent, etc.)
                noteData.components.articulations.forEach(art => {
                    art.setAttribute('fill', highlightColor);
                });

                // Add glow effect to entire group
                noteData.svgGroup.style.filter = glowColor;

            } else {
                // RESET ALL COMPONENTS
                noteData.components.noteheads.forEach((notehead, i) => {
                    notehead.setAttribute('fill', noteData.originalColors.noteheads[i] || '#000');
                    notehead.setAttribute('stroke', noteData.originalColors.noteheads[i] || '#000');
                });

                noteData.components.stems.forEach((stem, i) => {
                    stem.setAttribute('stroke', noteData.originalColors.stems[i] || '#000');
                    stem.setAttribute('fill', noteData.originalColors.stems[i] || '#000');
                });

                noteData.components.flags.forEach((flag, i) => {
                    flag.setAttribute('fill', noteData.originalColors.flags[i] || '#000');
                });

                noteData.components.accidentals.forEach((acc, i) => {
                    acc.setAttribute('fill', noteData.originalColors.accidentals[i] || '#000');
                });

                noteData.components.annotations.forEach((ann, i) => {
                    ann.setAttribute('fill', noteData.originalColors.annotations[i] || '#000');
                });

                noteData.components.articulations.forEach((art, i) => {
                    art.setAttribute('fill', noteData.originalColors.articulations[i] || '#000');
                });

                noteData.svgGroup.style.filter = 'none';
            }
        });

        // Update progress display
        const noteCountEl = document.getElementById('noteCount');
        if (noteCountEl && isPlaying) {
            noteCountEl.textContent = `${notesPlayed} / ${noteElements.length}`;

            // Check if all notes have been played
            if (notesPlayed >= noteElements.length) {
                console.log('🎵 All notes played! Stopping...');
                setTimeout(() => {
                    isPlaying = false;
                    cancelAnimationFrame(animationId);
                    showStatus('✅ Playback complete!', 'success');
                    document.getElementById('startBtn').textContent = 'Replay';
                    document.getElementById('startBtn').disabled = false;
                    document.getElementById('tempoSlider').disabled = false;
                }, 500);
            }
        }

        // Highlight beams near the guide line
        if (window.allBeams) {
            window.allBeams.forEach(beamData => {
                const beamBBox = beamData.element.getBBox();
                let beamWorldX;
                if (scrollMode === 'jumping') {
                    beamWorldX = beamBBox.x - scrollPos;
                } else {
                    beamWorldX = wrapperRect.left + beamBBox.x;
                }
                const distance = Math.abs(beamWorldX - guideRect.left);

                if (distance < 100) {
                    beamData.element.setAttribute('fill', highlightColor);
                } else {
                    beamData.element.setAttribute('fill', beamData.originalFill);
                }
            });
        }

        // Highlight slurs/curves near the guide line
        if (window.allCurves) {
            window.allCurves.forEach(curveData => {
                const curveBBox = curveData.element.getBBox();
                let curveWorldX;
                if (scrollMode === 'jumping') {
                    curveWorldX = curveBBox.x - scrollPos;
                } else {
                    curveWorldX = wrapperRect.left + curveBBox.x;
                }
                const distance = Math.abs(curveWorldX - guideRect.left);

                if (distance < 150) {
                    curveData.element.setAttribute('stroke', highlightColor);
                    curveData.element.setAttribute('stroke-width', '2');
                    curveData.element.style.filter = 'drop-shadow(0 0 8px rgba(46, 204, 113, 0.6))';
                } else {
                    curveData.element.setAttribute('stroke', curveData.originalStroke);
                    curveData.element.setAttribute('stroke-width', '1');
                    curveData.element.style.filter = 'none';
                }
            });
        }
    }

    // Animation
    function animate() {
        if (!isPlaying) return;

        const now = Date.now();
        const delta = (now - lastTime) / 1000;
        lastTime = now;

        const scrollSpeed = (bpm / 60) * 100;
        const scrollWrapper = document.getElementById('scrollWrapper');

        // Always update virtual scroll position
        scrollPos += scrollSpeed * delta;

        if (scrollMode === 'smooth') {
            // Original smooth scrolling
            scrollWrapper.style.transform = `translateX(-${scrollPos}px)`;

        } else if (scrollMode === 'jumping') {
            // Jumping mode: continue virtual scroll but snap view to measures

            const guideLine = document.querySelector('.guide-line');
            const guideX = guideLine ? parseInt(guideLine.style.left) || 200 : 200;

            // Find which measure the VIRTUAL scroll position is in
            const targetMeasure = measuresData.find(m =>
                scrollPos >= m.xStart - guideX && scrollPos < m.xEnd - guideX
            );

            if (targetMeasure) {
                // Check if we've moved to a new measure
                if (targetMeasure.index !== currentMeasureIndex) {
                    console.log(`📊 Jumping to measure ${targetMeasure.index + 1}`);
                    currentMeasureIndex = targetMeasure.index;
                }

                // Keep view locked to the current measure start
                const jumpToX = targetMeasure.xStart - guideX + 20;
                scrollWrapper.style.transform = `translateX(-${jumpToX}px)`;
            }

        } else if (scrollMode === 'center') {
            // Center focus: guide line in center, smooth scroll
            scrollWrapper.style.transform = `translateX(-${scrollPos}px)`;
        }

        highlightNotes();
        animationId = requestAnimationFrame(animate);
    }

    // Controls
    function startGame() {
        const startBtn = document.getElementById('startBtn');

        // If music finished, reset first
        if (startBtn.textContent === 'Replay') {
            resetGame();
            setTimeout(() => {
                startGame();
            }, 100);
            return;
        }

        if (!isPlaying) {
            isPlaying = true;
            lastTime = Date.now();
            startBtn.textContent = 'Playing...';
            startBtn.disabled = true;
            // document.getElementById('tempoSlider').disabled = true;
            animate();
        }
    }

    function pauseGame() {
        isPlaying = !isPlaying;
        if (isPlaying) {
            lastTime = Date.now();
            animate();
            document.getElementById('pauseBtn').textContent = 'Pause';
        } else {
            cancelAnimationFrame(animationId);
            document.getElementById('pauseBtn').textContent = 'Resume';
        }
    }

    function resetGame() {
        isPlaying = false;
        cancelAnimationFrame(animationId);
        scrollPos = 0;
        currentMeasureIndex = 0;
        lastPlayedNoteIndex = -1;
        document.getElementById('scrollWrapper').style.transform = 'translateX(0)';
        document.getElementById('startBtn').textContent = 'Start';
        document.getElementById('startBtn').disabled = false;

        // Reset note count display
        const noteCountEl = document.getElementById('noteCount');
        if (noteCountEl && noteElements.length > 0) {
            noteCountEl.textContent = `0 / ${noteElements.length}`;
        }

        showStatus('Reset! Ready to play again.', 'success');
        document.getElementById('pauseBtn').textContent = 'Pause';
        document.getElementById('tempoSlider').disabled = false;

        // Reset all highlights
        noteElements.forEach((noteData, index) => {
            if (noteData.svgElement) {
                noteData.svgElement.setAttribute('fill', noteData.originalFill);
                noteData.svgElement.setAttribute('stroke', '#000');
                noteData.svgElement.style.filter = 'none';
            }
        });
    }

    function showStatus(msg, type = 'info') {
        const container = document.getElementById('toastContainer');
        if (!container) return;

        const toast = document.createElement('div');
        toast.className = `toast ${type}`;
        toast.textContent = msg;

        container.appendChild(toast);

        // trigger transition
        requestAnimationFrame(() => {
            toast.classList.add('show');
        });

        // fade out & remove
        setTimeout(() => {
            toast.classList.remove('show');
        }, 2500);

        setTimeout(() => {
            toast.remove();
        }, 3200);
    }

    // File upload
    document.getElementById('fileInput').addEventListener('change', e => {
        const file = e.target.files[0];
        if (file) {
            // Reset game first
            resetGame();
            lastPlayedNoteIndex = -1;
            const reader = new FileReader();
            reader.onload = function (evt) {
                console.log('File loaded, parsing MusicXML...');
                parseMusicXML(evt.target.result);
            };
            reader.onerror = function () {
                showStatus('Error reading file', 'error');
            };
            reader.readAsText(file);
        }
    });

    const tempoSlider = document.getElementById('tempoSlider');
    const tempoValueEl = document.getElementById('tempoValue');
    const currentTempoEl = document.getElementById('currentTempo');

    if (tempoSlider) {
        bpm = parseInt(tempoSlider.value);
        if (tempoValueEl) tempoValueEl.textContent = `${bpm} BPM`;
        if (currentTempoEl) currentTempoEl.textContent = bpm;

        tempoSlider.addEventListener('input', e => {
            bpm = parseInt(e.target.value);
            if (tempoValueEl) tempoValueEl.textContent = `${bpm} BPM`;
            if (currentTempoEl) currentTempoEl.textContent = bpm;
        });
    }

    // Buttons
    document.getElementById('startBtn').addEventListener('click', startGame);
    document.getElementById('pauseBtn').addEventListener('click', pauseGame);
    document.getElementById('resetBtn').addEventListener('click', resetGame);
    // Color Picker
    // Highlight color picker
    const highlightInput = document.getElementById('highlightColor');
    if (highlightInput) {
        highlightInput.addEventListener('input', (e) => {
            highlightColor = e.target.value || '#2ecc71';
            showStatus(`Highlight color: ${highlightColor}`, 'success');
        });
    }

    console.log('=== SETTING UP SCROLL MODE BUTTONS ===');
    const scrollModeButtons = document.getElementById('scrollModeButtons');
    const modeBtns = document.querySelectorAll('.mode-btn');

    function setActiveModeButton(mode) {
        modeBtns.forEach(btn => {
            btn.classList.remove('active');
            if (btn.getAttribute('data-mode') === mode) {
                btn.classList.add('active');
            }
        });
    }

    if (scrollModeButtons) {
        setActiveModeButton(scrollMode);
        positionGuideLine();

        scrollModeButtons.addEventListener('click', (e) => {
            const btn = e.target.closest('.mode-btn');
            if (btn) {
                const newMode = btn.getAttribute('data-mode');
                if (newMode && newMode !== scrollMode) {
                    scrollMode = newMode;
                    console.log('Scroll mode changed to:', scrollMode);

                    // Update visual state
                    setActiveModeButton(scrollMode);

                    // Reset scroll + guide line when not playing
                    if (!isPlaying) {
                        resetGame();
                    }
                    positionGuideLine();
                    showStatus(`Scroll mode: ${scrollMode}`, 'success');
                }
            }
        });
    }

    // Sound toggle
    const soundToggle = document.getElementById('soundToggle');
    if (soundToggle) {
        soundToggle.addEventListener('click', async function () {
            soundEnabled = !soundEnabled;

            if (soundEnabled) {
                // Initialize Tone.js (needs user interaction to start audio context)
                await Tone.start();
                initializeSound();
                this.setAttribute('data-enabled', 'true');
                this.textContent = '🔊 On';
                showStatus('Sound enabled! 🎵', 'success');
            } else {
                this.setAttribute('data-enabled', 'false');
                this.textContent = '🔇 Off';
                showStatus('Sound disabled', 'info');
            }
        });
    }

    // NO DEFAULT SONG - Wait for user upload
    showStatus('✅ VexFlow Ready! Upload your MusicXML file to begin.', 'success');

    // Initialize Tone.js synthesizer
    function initializeSound() {
        if (!synth) {
            // Create a polyphonic synth (can play multiple notes at once for chords)
            synth = new Tone.PolySynth(Tone.Synth, {
                oscillator: {
                    type: 'triangle' // Soft, pleasant sound for kids
                },
                envelope: {
                    attack: 0.005,
                    decay: 0.1,
                    sustain: 0.3,
                    release: 1
                }
            }).toDestination();

            // Set volume
            synth.volume.value = -10; // Slightly quieter

            console.log('🎹 Tone.js initialized');
        }
    }

    // Convert VexFlow note notation to Tone.js format
    function vexflowNoteToToneNote(vexflowNote) {
        // VexFlow format: "c/4", "d#/5", "eb/3"
        // Tone.js format: "C4", "D#5", "Eb3"

        const [note, octave] = vexflowNote.split('/');
        return note.toUpperCase() + octave;
    }

    // Play a note or chord
    function playNote(noteData) {
        if (!soundEnabled || !synth) return;

        try {
            // Convert all keys in the note (handles chords)
            const toneNotes = noteData.keys.map(vexflowNoteToToneNote);

            // Calculate duration based on note type
            const durationMap = {
                'w': '1n',   // whole note
                'h': '2n',   // half note
                'q': '4n',   // quarter note
                '8': '8n',   // eighth note
                '16': '16n'  // sixteenth note
            };

            const duration = durationMap[noteData.duration] || '4n';

            // Play the note(s) immediately
            synth.triggerAttackRelease(toneNotes, duration);

            console.log(`🎵 Playing: ${toneNotes.join(', ')} (${duration})`);
        } catch (e) {
            console.error('Error playing note:', e);
        }
    }
}