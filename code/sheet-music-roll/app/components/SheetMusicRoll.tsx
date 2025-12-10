"use client";

import React, { useState, useRef, useEffect } from "react";
import { renderScoreInto } from "@/src/lib/vex/renderScore";
import type { MusicData } from "@/src/lib/types/musicTypes";
import { parseMusicXML } from "@/src/lib/musicXML/parseMusicXML";

type ScrollMode = "smooth" | "jump" | "center";

export const SheetMusicRoll: React.FC = () => {
  const [musicData, setMusicData] = useState<MusicData | null>(null);
  const [bpm, setBpm] = useState(100);
  const [scrollMode, setScrollMode] = useState<ScrollMode>("smooth");
  const [isPlaying, setIsPlaying] = useState(false);
  const [noteCount, setNoteCount] = useState({ played: 0, total: 0 });

  const scrollWrapperRef = useRef<HTMLDivElement | null>(null);
  const canvasRef = useRef<HTMLDivElement | null>(null);
  const guideLineRef = useRef<HTMLDivElement | null>(null);
  const animationRef = useRef<number | null>(null);
  const lastTimeRef = useRef<number>(0);
  const scrollPosRef = useRef<number>(0);
  const measuresRef = useRef<ReturnType<typeof renderScoreInto>["measures"]>(
    []
  );
  const notesRef = useRef<ReturnType<typeof renderScoreInto>["notes"]>([]);

  // stop on unmount
  useEffect(() => {
    return () => {
      if (animationRef.current != null) {
        cancelAnimationFrame(animationRef.current);
      }
    };
  }, []);

  const handleFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    const reader = new FileReader();
    reader.onload = (ev) => {
      const text = String(ev.target?.result || "");
      const parsed = parseMusicXML(text);
      setMusicData(parsed);
    };
    reader.readAsText(file);
  };

  // whenever musicData changes, render score
  useEffect(() => {
    if (!musicData || !canvasRef.current) return;

    const result = renderScoreInto(canvasRef.current, musicData);
    measuresRef.current = result.measures;
    notesRef.current = result.notes;
    setNoteCount({ played: 0, total: result.notes.length });
    scrollPosRef.current = 0;

    if (scrollWrapperRef.current) {
      scrollWrapperRef.current.style.transform = "translateX(0px)";
    }
  }, [musicData]);

  const animate = () => {
    if (!isPlaying) return;
    const now = performance.now();
    const last = lastTimeRef.current || now;
    const delta = (now - last) / 1000;
    lastTimeRef.current = now;

    const scrollWrapper = scrollWrapperRef.current;
    const guide = guideLineRef.current;
    if (!scrollWrapper || !guide) return;

    const beatsPerSecond = bpm / 60;
    const beatAdvance = beatsPerSecond * delta;

    // we’re still using pixels for scroll _distance_,
    // but you now _could_ convert beats → x with measuresRef if you want.
    const pxPerSecond = (bpm / 60) * 100;
    scrollPosRef.current += pxPerSecond * delta;

    scrollWrapper.style.transform = `translateX(-${scrollPosRef.current}px)`;

    // TODO: update note highlight using notesRef + scrollPosRef
    // and update noteCount accordingly.

    animationRef.current = requestAnimationFrame(animate);
  };

  const handleStart = () => {
    if (!musicData) return;
    if (isPlaying) return;
    setIsPlaying(true);
    lastTimeRef.current = performance.now();
    animationRef.current = requestAnimationFrame(animate);
  };

  const handlePause = () => {
    setIsPlaying((prev) => {
      const next = !prev;
      if (!next && animationRef.current != null) {
        cancelAnimationFrame(animationRef.current);
      } else if (next) {
        lastTimeRef.current = performance.now();
        animationRef.current = requestAnimationFrame(animate);
      }
      return next;
    });
  };

  const handleReset = () => {
    setIsPlaying(false);
    if (animationRef.current != null)
      cancelAnimationFrame(animationRef.current);
    scrollPosRef.current = 0;
    lastTimeRef.current = 0;
    if (scrollWrapperRef.current) {
      scrollWrapperRef.current.style.transform = "translateX(0px)";
    }
    setNoteCount((nc) => ({ played: 0, total: nc.total }));
  };

  return (
    <div className="main-container">
      <header className="header">
        <div className="header-left">
          <div className="work-meta">
            <span className="work-title" id="workTitle">
              {musicData?.workTitle || "Sheet Music Roll"}
            </span>
            <span className="work-composer" id="composerName">
              {musicData ? `by ${musicData.composer}` : "by Composer"}
            </span>
          </div>
          <div className="score-display">
            <div className="score-item">
              <span className="score-label">Tempo</span>
              <span className="score-value" id="currentTempo">
                {bpm}
              </span>
            </div>
            <div className="score-item">
              <span className="score-label">Notes Played</span>
              <span className="score-value" id="noteCount">
                {noteCount.played} / {noteCount.total}
              </span>
            </div>
          </div>
        </div>

        <div className="header-right">
          <div className="control-group upload-group">
            <label htmlFor="fileInput" className="file-label">
              📤 Upload MusicXML
            </label>
            <input
              type="file"
              id="fileInput"
              className="file-input"
              accept=".xml,.musicxml"
              onChange={handleFileChange}
            />
          </div>

          <div className="control-group tempo-group">
            <label htmlFor="tempoSlider">Tempo</label>
            <input
              type="range"
              id="tempoSlider"
              className="tempo-slider"
              min={40}
              max={180}
              step={5}
              value={bpm}
              onChange={(e) => setBpm(parseInt(e.target.value, 10))}
            />
            <span className="tempo-value" id="tempoValue">
              {bpm} BPM
            </span>
          </div>

          <div className="control-group button-group">
            <button className="btn btn-primary" onClick={handleStart}>
              ▶ Start
            </button>
            <button className="btn btn-secondary" onClick={handlePause}>
              ⏸ Pause
            </button>
            <button className="btn btn-secondary" onClick={handleReset}>
              🔁 Reset
            </button>
          </div>
        </div>
      </header>

      <div className="main-container">
        <div className="sheet-music-viewport">
          <div className="guide-line" ref={guideLineRef} />
          <div
            className="music-scroll-wrapper"
            id="scrollWrapper"
            ref={scrollWrapperRef}
          >
            <div id="musicCanvas" ref={canvasRef}>
              {!musicData && (
                <div className="loading">Upload a MusicXML file to start</div>
              )}
            </div>
          </div>
        </div>
      </div>
    </div>
  );
};
