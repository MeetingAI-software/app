'use client';

import React, { useState, useEffect, useRef } from 'react';
import Link from 'next/link';
import Script from 'next/script';
import { BackgroundPaths } from '@/components/ui/background-paths';

export default function Home() {
  const demoLink = "/s/demo"; // Real production demo link
  const contactEmail = "hello@meetingai.eu";

  // View switcher state
  const [activeView, setActiveView] = useState<'summary' | 'transcript'>('summary');
  
  // Search query state for full transcript
  const [searchQuery, setSearchQuery] = useState('');

  // Refs for interactive elements
  const threeContainerRef = useRef<HTMLDivElement>(null);
  const threeInstanceRef = useRef<{ destroy: () => void } | null>(null);

  // Magnetic Button effect handlers
  const handleMagneticMouseMove = (e: React.MouseEvent<HTMLAnchorElement | HTMLButtonElement>) => {
    const btn = e.currentTarget;
    const rect = btn.getBoundingClientRect();
    const x = e.clientX - rect.left - rect.width / 2;
    const y = e.clientY - rect.top - rect.height / 2;
    btn.style.transform = `translate(${x * 0.2}px, ${y * 0.2}px)`;
    btn.style.transition = 'transform 0.1s ease-out';
  };

  const handleMagneticMouseLeave = (e: React.MouseEvent<HTMLAnchorElement | HTMLButtonElement>) => {
    const btn = e.currentTarget;
    btn.style.transform = 'translate(0px, 0px)';
    btn.style.transition = 'transform 0.5s cubic-bezier(0.34, 1.56, 0.64, 1)';
  };

  // Parallax Card effect handlers
  const handleCardMouseMove = (e: React.MouseEvent<HTMLDivElement>) => {
    const card = e.currentTarget;
    const rect = card.getBoundingClientRect();
    const x = e.clientX - rect.left;
    const y = e.clientY - rect.top;
    const centerX = rect.width / 2;
    const centerY = rect.height / 2;
    const rotateX = ((y - centerY) / centerY) * -10;
    const rotateY = ((x - centerX) / centerX) * 10;
    
    card.style.transform = `perspective(1000px) rotateX(${rotateX}deg) rotateY(${rotateY}deg) scale3d(1.02, 1.02, 1.02)`;
    card.style.boxShadow = '0 15px 30px -10px rgba(0,0,0,0.1)';
  };

  const handleCardMouseLeave = (e: React.MouseEvent<HTMLDivElement>) => {
    const card = e.currentTarget;
    card.style.transform = 'perspective(1000px) rotateX(0deg) rotateY(0deg) scale3d(1, 1, 1)';
    card.style.boxShadow = '0 2px 10px -4px rgba(0,0,0,0.05)';
  };

  // Initialize Three.js scene when THREE is loaded globally
  const initThreeScene = () => {
    const container = threeContainerRef.current;
    if (!container || typeof window === 'undefined' || !(window as any).THREE) return;
    
    // Avoid double initialization
    if (threeInstanceRef.current) return;

    const THREE = (window as any).THREE;
    const width = container.clientWidth || window.innerWidth / 2;
    const height = container.clientHeight || window.innerHeight;

    const scene = new THREE.Scene();
    const camera = new THREE.PerspectiveCamera(75, width / height, 0.1, 1000);
    camera.position.z = 5;
    camera.position.x = -1.5; 

    const renderer = new THREE.WebGLRenderer({ alpha: true, antialias: true });
    renderer.setSize(width, height);
    renderer.setPixelRatio(window.devicePixelRatio);
    container.appendChild(renderer.domElement);

    const group = new THREE.Group();
    const barCount = 24;
    const bars: any[] = [];
    const geometry = new THREE.BoxGeometry(0.04, 0.3, 0.04);

    for (let i = 0; i < barCount; i++) {
      const material = new THREE.MeshPhongMaterial({ 
        color: 0x0051d5, 
        transparent: true, 
        opacity: 0.7,
        shininess: 80 
      });
      const mesh = new THREE.Mesh(geometry, material);
      mesh.position.x = (i - barCount / 2) * 0.08;
      mesh.position.y = 0;
      mesh.position.z = 0;
      group.add(mesh);
      bars.push(mesh);
    }
    scene.add(group);

    const light = new THREE.DirectionalLight(0xffffff, 1);
    light.position.set(5, 5, 5);
    scene.add(light);
    scene.add(new THREE.AmbientLight(0xffffff, 0.6));

    let mouseX = 0, mouseY = 0;
    const handleMouseMove = (e: MouseEvent) => {
      mouseX = (e.clientX / window.innerWidth) * 2 - 1;
      mouseY = -(e.clientY / window.innerHeight) * 2 + 1;
    };
    window.addEventListener('mousemove', handleMouseMove);

    let animationFrameId: number;
    function animate() {
      animationFrameId = requestAnimationFrame(animate);
      
      const time = Date.now() * 0.003; // Moderately active speed
      bars.forEach((bar, i) => {
        // Multi-frequency formants simulating speech vocal cords
        const voiceFormant1 = Math.sin(time * 2.5 + i * 0.4) * 0.35;
        const voiceFormant2 = Math.cos(time * 1.2 - i * 0.7) * 0.25;
        const voiceFormant3 = Math.sin(time * 4.0 + i * 0.9) * 0.15;
        
        // Bell-curve envelope to focus the wave energy in the center
        const centerDist = Math.abs(i - barCount / 2) / (barCount / 2);
        const envelope = Math.max(0.15, 1 - centerDist * centerDist);
        
        const barX = bar.position.x;
        const targetX = mouseX * 1.5;
        const dist = Math.abs(barX - targetX);
        const mouseForce = Math.max(0, 1 - dist / 1.0) * 0.8;
        
        const speechActivity = Math.abs(voiceFormant1 + voiceFormant2 + voiceFormant3) * (0.8 + mouseForce);
        const amplitude = 0.15 + speechActivity * envelope * 2.0;
        
        bar.scale.y = THREE.MathUtils.lerp(bar.scale.y, amplitude * 3.5, 0.12); // Responsive but smooth
        
        const colorMix = Math.min(1, amplitude / 1.5);
        bar.material.color.setHSL(0.61 - colorMix * 0.08, 0.9, 0.42 + colorMix * 0.18);
        bar.material.opacity = 0.5 + (amplitude * 0.25);
      });

      group.rotation.y = THREE.MathUtils.lerp(group.rotation.y, mouseX * 0.25, 0.04);
      
      renderer.render(scene, camera);
    }

    animate();

    const handleResize = () => {
      const w = container.clientWidth || window.innerWidth / 2;
      const h = container.clientHeight || window.innerHeight;
      camera.aspect = w / h;
      camera.updateProjectionMatrix();
      renderer.setSize(w, h);
    };
    window.addEventListener('resize', handleResize);

    threeInstanceRef.current = {
      destroy: () => {
        cancelAnimationFrame(animationFrameId);
        window.removeEventListener('mousemove', handleMouseMove);
        window.removeEventListener('resize', handleResize);
        if (container.contains(renderer.domElement)) {
          container.removeChild(renderer.domElement);
        }
      }
    };
  };

  useEffect(() => {
    // Try to initialize in case script is already loaded
    if (typeof window !== 'undefined' && (window as any).THREE) {
      initThreeScene();
    }
    return () => {
      if (threeInstanceRef.current) {
        threeInstanceRef.current.destroy();
        threeInstanceRef.current = null;
      }
    };
  }, []);

  const speakers = [
    { name: "Sarah Jenkins", time: "02:14", text: "Alright, let's get started. Looking at the Q3 roadmap, we need to make a call on prioritization. The mobile app architecture is lagging, and honestly, I think we need to deprioritize the web feature enhancements to catch up.", color: "border-slate-400" },
    { name: "Marcus Lin", time: "02:45", text: "I agree with Sarah. From a marketing perspective, the mobile launch is our biggest lever for Q4 acquisition. We've got the $150k budget approved, and we need the product ready to support the campaign.", color: "border-slate-300" },
    { name: "David Chen", time: "03:12", text: "Shifting resources is fine, but we have a bottleneck. The engineering team needs at least an additional 2 weeks for security audits on the new architecture before we can even think about a beta release.", color: "border-slate-500", highlight: "Highlight: Security Audit Delay" },
    { name: "Sarah Jenkins", time: "03:50", text: "Okay, that's a hard constraint. Let's officially delay the beta launch to Nov 15th to accommodate the audit. David, can we shift 3 backend devs to the mobile infra team today to start accelerating that?", color: "border-slate-400" }
  ];

  const filteredSpeakers = speakers.filter(speaker => 
    speaker.name.toLowerCase().includes(searchQuery.toLowerCase()) || 
    speaker.text.toLowerCase().includes(searchQuery.toLowerCase())
  );

  return (
    <>
      <Script 
        src="https://cdnjs.cloudflare.com/ajax/libs/three.js/r128/three.min.js" 
        strategy="lazyOnload"
        onLoad={initThreeScene}
      />
      {/* Stylesheets for fonts */}
      <link href="https://fonts.googleapis.com/css2?family=Material+Symbols+Outlined:wght,FILL@100..700,0..1&display=swap" rel="stylesheet"/>
      <link href="https://fonts.googleapis.com" rel="preconnect"/>
      <link href="https://fonts.googleapis.com/css2?family=Geist:wght@400;600;700&family=Inter:wght@400;500;600&family=JetBrains+Mono:wght@400;500&display=swap" rel="stylesheet"/>

      <div className="font-body-md text-body-md bg-transparent min-h-screen relative overflow-x-hidden selection:bg-slate-200">
        
        {/* TopNavBar */}
        <header className="bg-surface-container-lowest/80 backdrop-blur-md font-body-md text-body-md fixed top-0 w-full z-50 content-layer">
          <div className="flex justify-between items-center px-margin-page py-4 max-w-container-max mx-auto">
            <div className="flex items-center gap-8 lg:gap-10">
              <Link href="/" className="font-headline-md text-headline-md font-bold tracking-tight text-slate-900 flex items-center gap-2">
                {/* eslint-disable-next-line @next/next/no-img-element */}
                <img src="/nota-mark-black.svg" alt="Syncmemos logo" width={28} height={28} className="h-7 w-7" />
                Syncmemos
              </Link>
              <nav className="hidden md:flex items-center gap-gutter">
                <a href="#features" className="text-on-surface-variant hover:text-secondary transition-colors duration-200 font-medium">Features</a>
                <Link href="/pricing" className="text-on-surface-variant hover:text-secondary transition-colors duration-200 font-medium">Pricing</Link>
                <a href="#demo" className="text-on-surface-variant hover:text-secondary transition-colors duration-200 font-medium">Demo</a>
              </nav>
            </div>
            <div className="flex items-center gap-4 lg:mr-6">
              <Link href="/meetings" className="hidden sm:inline-block text-slate-900 font-medium hover:text-secondary transition-colors duration-200">
                Sign In
              </Link>
              <Link 
                href="/meetings" 
                className="magnetic-btn btn-shimmer bg-slate-900 text-white px-6 py-2 rounded font-medium hover:bg-slate-800 transition-colors shadow-sm text-sm"
                onMouseMove={handleMagneticMouseMove}
                onMouseLeave={handleMagneticMouseLeave}
              >
                Get Started
              </Link>
            </div>
          </div>
        </header>

        {/* Hero Section — animated background paths */}
        <BackgroundPaths />

        {/* Interactive Component Preview */}
        <section className="py-section-gap bg-slate-50/90 backdrop-blur-sm content-layer relative z-10" id="demo">
          <div className="max-w-4xl mx-auto px-margin-page">
            <div className="flex justify-center mb-stack-lg blur-in" style={{ animationDelay: '0.2s' }}>
              <div className="inline-flex bg-white rounded border border-slate-200 p-1 shadow-sm">
                <button 
                  className={`toggle-btn px-6 py-2 rounded text-sm font-medium transition-colors ${activeView === 'summary' ? 'active' : 'border-transparent'}`}
                  id="btn-summary" 
                  onClick={() => setActiveView('summary')}
                >
                  Summary View
                </button>
                <button 
                  className={`toggle-btn px-6 py-2 rounded text-sm font-medium transition-colors ${activeView === 'transcript' ? 'active' : 'border-transparent'}`}
                  id="btn-transcript" 
                  onClick={() => setActiveView('transcript')}
                >
                  Transcript View
                </button>
              </div>
            </div>
            <div className="blur-in bg-white border border-slate-200 rounded shadow-sm overflow-hidden" style={{ minHeight: '480px', animationDelay: '0.4s' }}>
              {/* State A (Summary) */}
              {activeView === 'summary' && (
                <div className="p-8 block animate-[fadeIn_0.3s_ease-out]" id="view-summary">
                  <div className="flex items-center justify-between border-b border-slate-200 pb-4 mb-6">
                    <div>
                      <h3 className="font-headline-md text-2xl font-bold text-slate-900">Q3 Product Strategy Sync</h3>
                      <div className="font-label-mono text-xs text-on-surface-variant mt-2 flex items-center gap-4">
                        <span className="flex items-center gap-1"><span className="material-symbols-outlined text-[16px]">calendar_today</span> Oct 12, 2024</span>
                        <span className="flex items-center gap-1"><span className="material-symbols-outlined text-[16px]">schedule</span> 45 mins</span>
                      </div>
                    </div>
                    <div className="flex -space-x-2">
                      <div className="w-8 h-8 rounded-full bg-slate-200 border-2 border-white flex items-center justify-center text-xs font-bold text-slate-600">S</div>
                      <div className="w-8 h-8 rounded-full bg-slate-300 border-2 border-white flex items-center justify-center text-xs font-bold text-slate-700">M</div>
                      <div className="w-8 h-8 rounded-full bg-slate-400 border-2 border-white flex items-center justify-center text-xs font-bold text-white">J</div>
                    </div>
                  </div>
                  <div className="grid grid-cols-1 md:grid-cols-3 gap-8">
                    <div className="md:col-span-2 space-y-6">
                      <div>
                        <h4 className="font-label-mono text-[13px] font-bold text-slate-900 mb-3 uppercase tracking-wider">Key Takeaways</h4>
                        <ul className="space-y-3 font-body-md text-slate-600">
                          <li className="flex items-start gap-3">
                            <div className="w-1.5 h-1.5 rounded-full bg-slate-900 mt-2.5 flex-shrink-0"></div>
                            <p>The Q3 roadmap will prioritize the new mobile app architecture over minor web feature enhancements.</p>
                          </li>
                          <li className="flex items-start gap-3">
                            <div className="w-1.5 h-1.5 rounded-full bg-slate-900 mt-2.5 flex-shrink-0"></div>
                            <p>Marketing budget for the launch has been approved at $150k, allocated primarily to digital channels.</p>
                          </li>
                          <li className="flex items-start gap-3">
                            <div className="w-1.5 h-1.5 rounded-full bg-slate-900 mt-2.5 flex-shrink-0"></div>
                            <p>Engineering team needs an additional 2 weeks for security audits before the beta release.</p>
                          </li>
                        </ul>
                      </div>
                      <div>
                        <h4 className="font-label-mono text-[13px] font-bold text-slate-900 mb-3 uppercase tracking-wider">Decisions Made</h4>
                        <div className="space-y-2">
                          <div className="flex items-center gap-3 p-3 bg-slate-50 border border-slate-100 rounded">
                            <span className="material-symbols-outlined text-success" style={{ fontVariationSettings: "'FILL' 1" }}>check_circle</span>
                            <span className="font-body-md text-slate-900 font-medium">Delay beta launch to Nov 15th for security compliance.</span>
                          </div>
                          <div className="flex items-center gap-3 p-3 bg-slate-50 border border-slate-100 rounded">
                            <span className="material-symbols-outlined text-success" style={{ fontVariationSettings: "'FILL' 1" }}>check_circle</span>
                            <span className="font-body-md text-slate-900 font-medium">Shift 3 backend devs to the mobile infrastructure team.</span>
                          </div>
                        </div>
                      </div>
                    </div>
                    <div className="space-y-4">
                      <h4 className="font-label-mono text-[13px] font-bold text-slate-900 mb-3 uppercase tracking-wider">Action Items</h4>
                      <div className="p-4 border border-slate-200 rounded flex flex-col gap-3">
                        <div className="flex items-center gap-2">
                          <div className="w-6 h-6 rounded-full bg-slate-200 flex items-center justify-center text-[10px] font-bold text-slate-600">S</div>
                          <span className="font-body-md text-sm text-slate-900 font-semibold">Sarah Jenkins</span>
                        </div>
                        <p className="text-sm text-on-surface-variant">Draft updated project timeline and share with stakeholders.</p>
                        <span className="text-xs text-secondary font-medium">Due: Tomorrow</span>
                      </div>
                      <div className="p-4 border border-slate-200 rounded flex flex-col gap-3">
                        <div className="flex items-center gap-2">
                          <div className="w-6 h-6 rounded-full bg-slate-300 flex items-center justify-center text-[10px] font-bold text-slate-700">M</div>
                          <span className="font-body-md text-sm text-slate-900 font-semibold">Marcus Lin</span>
                        </div>
                        <p className="text-sm text-on-surface-variant">Finalize marketing spend breakdown for approval.</p>
                        <span className="text-xs text-secondary font-medium">Due: Friday</span>
                      </div>
                    </div>
                  </div>
                </div>
              )}
              {/* State B (Transcript) */}
              {activeView === 'transcript' && (
                <div className="p-0 block animate-[fadeIn_0.3s_ease-out]" id="view-transcript">
                  <div className="bg-slate-50 border-b border-slate-200 p-4 px-8 sticky top-0 z-10 flex justify-between items-center">
                    <div className="font-label-mono text-[13px] font-bold text-slate-900">Full Transcript</div>
                    <div className="relative">
                      <span className="material-symbols-outlined absolute left-3 top-1/2 transform -translate-y-1/2 text-slate-400 text-[18px]">search</span>
                      <input 
                        className="pl-9 pr-4 py-1.5 text-sm border border-slate-200 rounded focus:outline-none focus:border-secondary focus:ring-1 focus:ring-secondary/30 w-64 bg-white text-slate-900" 
                        placeholder="Search transcript..." 
                        type="text"
                        value={searchQuery}
                        onChange={(e) => setSearchQuery(e.target.value)}
                      />
                    </div>
                  </div>
                  <div className="p-8 space-y-8 relative timeline-line">
                    {filteredSpeakers.map((speaker, index) => (
                      <div className="relative z-10 pl-12" key={index}>
                        <div className={`absolute left-[14px] top-1 w-3 h-3 bg-white border-2 ${speaker.color} rounded-full`}></div>
                        <div className="flex items-baseline gap-3 mb-1">
                          <span className="font-bold text-slate-900 text-sm">{speaker.name}</span>
                          <span className="font-label-mono text-slate-400 text-xs">{speaker.time}</span>
                        </div>
                        <p className="text-on-surface-variant text-sm leading-relaxed">
                          {speaker.text}
                        </p>
                        {speaker.highlight && (
                          <div className="mt-3 inline-flex items-center gap-1.5 px-2.5 py-1 bg-warning/10 text-warning border border-warning/20 rounded-full text-xs font-medium">
                            <span className="material-symbols-outlined text-[14px]">flag</span>
                            {speaker.highlight}
                          </div>
                        )}
                      </div>
                    ))}
                    {filteredSpeakers.length === 0 && (
                      <p className="text-slate-400 text-sm text-center py-8">No matching entries found.</p>
                    )}
                  </div>
                </div>
              )}
            </div>
          </div>
        </section>

        {/* Value Prop Section */}
        <section className="py-section-gap px-margin-page max-w-container-max mx-auto content-layer relative z-10 bg-white/80 backdrop-blur-sm rounded-3xl my-8" id="features">
          <div className="text-center mb-stack-lg blur-in">
            <h2 className="font-headline-lg text-4xl md:text-5xl font-bold text-slate-900 tracking-tight">Architectural precision.</h2>
            <p className="font-body-lg text-lg text-on-surface-variant mt-4">Tools designed for clarity, not novelty.</p>
          </div>
          <div className="grid grid-cols-1 md:grid-cols-3 gap-8">
            {/* Prop 1 */}
            <div 
              className="parallax-card p-8 border border-slate-200 rounded bg-white shadow-[0_2px_10px_-4px_rgba(0,0,0,0.05)] transition-all duration-200 ease-out cursor-default"
              onMouseMove={handleCardMouseMove}
              onMouseLeave={handleCardMouseLeave}
            >
              <div className="w-12 h-12 bg-slate-50 border border-slate-200 rounded flex items-center justify-center mb-6">
                <span className="material-symbols-outlined text-slate-900 text-2xl">device_hub</span>
              </div>
              <h3 className="font-headline-md text-xl font-bold text-slate-900 mb-3">Meet Bots</h3>
              <p className="text-on-surface-variant text-sm leading-relaxed">
                Deploy silent observers to any major video conferencing platform. They join automatically, record securely, and detach cleanly without interrupting flow.
              </p>
            </div>
            {/* Prop 2 */}
            <div 
              className="parallax-card p-8 border border-slate-200 rounded bg-white shadow-[0_2px_10px_-4px_rgba(0,0,0,0.05)] transition-all duration-200 ease-out cursor-default"
              onMouseMove={handleCardMouseMove}
              onMouseLeave={handleCardMouseLeave}
            >
              <div className="w-12 h-12 bg-slate-50 border border-slate-200 rounded flex items-center justify-center mb-6">
                <span className="material-symbols-outlined text-slate-900 text-2xl">upload_file</span>
              </div>
              <h3 className="font-headline-md text-xl font-bold text-slate-900 mb-3">Audio Upload</h3>
              <p className="text-on-surface-variant text-sm leading-relaxed">
                Process offline recordings with structural integrity. Our engine handles multi-speaker parsing and timeline reconstruction from raw audio files instantly.
              </p>
            </div>
            {/* Prop 3 */}
            <div 
              className="parallax-card p-8 border border-slate-200 rounded bg-white shadow-[0_2px_10px_-4px_rgba(0,0,0,0.05)] transition-all duration-200 ease-out cursor-default"
              onMouseMove={handleCardMouseMove}
              onMouseLeave={handleCardMouseLeave}
            >
              <div className="w-12 h-12 bg-slate-50 border border-slate-200 rounded flex items-center justify-center mb-6">
                <span className="material-symbols-outlined text-slate-900 text-2xl">forum</span>
              </div>
              <h3 className="font-headline-md text-xl font-bold text-slate-900 mb-3">AI Chat</h3>
              <p className="text-on-surface-variant text-sm leading-relaxed">
                Query your meeting repository like a database. Extract specific metrics, decisions, or contextual references without skimming through hours of video.
              </p>
            </div>
          </div>
        </section>

        {/* Footer */}
        <footer className="bg-surface-container-low/90 backdrop-blur-md font-body-md text-body-md w-full py-section-gap content-layer relative z-10" id="pricing">
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-gutter px-margin-page max-w-container-max mx-auto">
            <div className="col-span-1 md:col-span-2 lg:col-span-1 flex flex-col gap-4">
              <Link href="/" className="font-headline-md text-2xl font-bold text-slate-900 flex items-center gap-2 hover:text-secondary transition-colors duration-200">
                <span className="material-symbols-outlined" style={{ fontVariationSettings: "'FILL' 1" }}>summarize</span>
                MeetingAI
              </Link>
              <p className="text-on-surface text-sm mt-2">
                © 2024 MeetingAI. All rights reserved. Precise summaries for high-performing teams.
              </p>
            </div>
            <div className="flex flex-col gap-3">
              <h4 className="font-label-mono text-[13px] font-bold text-slate-900 uppercase tracking-wider mb-2">Legal</h4>
              <a className="text-on-tertiary-container hover:text-secondary transition-colors duration-200 text-sm font-medium" href="#">Privacy Policy</a>
              <a className="text-on-tertiary-container hover:text-secondary transition-colors duration-200 text-sm font-medium" href="#">Terms of Service</a>
              <a className="text-on-tertiary-container hover:text-secondary transition-colors duration-200 text-sm font-medium" href="#">Security</a>
            </div>
            <div className="flex flex-col gap-3">
              <h4 className="font-label-mono text-[13px] font-bold text-slate-900 uppercase tracking-wider mb-2">Company</h4>
              <a className="text-on-tertiary-container hover:text-secondary transition-colors duration-200 text-sm font-medium" href={`mailto:${contactEmail}`}>Contact Us</a>
              <a className="text-on-tertiary-container hover:text-secondary transition-colors duration-200 text-sm font-medium" href="#">Twitter</a>
              <a className="text-on-tertiary-container hover:text-secondary transition-colors duration-200 text-sm font-medium" href="#">LinkedIn</a>
            </div>
            <div className="flex flex-col gap-3">
              <h4 className="font-label-mono text-[13px] font-bold text-slate-900 uppercase tracking-wider mb-2">System</h4>
              <div className="flex items-center gap-2 text-sm text-on-tertiary-container font-medium">
                <div className="w-2 h-2 rounded-full bg-success"></div>
                All systems operational
              </div>
            </div>
          </div>
        </footer>
      </div>
    </>
  );
}

