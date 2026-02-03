tags) ===== -->

<script {{ nonce_attr() }} nonce="{{ NONCE }}">
  @keyframes pop { 0% { transform: scale(0.8); opacity: 0; } 70% { transform: scale(1.1); opacity: 1;} 100% { transform: scale(1); } }
  .animate-pop { animation: pop 0.7s cubic-bezier(.2,1.7,.7,1) both; }
  .animate-pop-slow { animation: pop 1.2s cubic-bezier(.2,1.7,.7,1) both; }
  @keyframes wiggle { 0%,100% { transform: rotate(-8deg);} 50% { transform: rotate(8deg);} }
  .animate-wiggle { animation: wiggle 1.4s infinite alternate; }
  .animate-bounce { animation: bounce 1.2s infinite; }
  @keyframes vip-glow { 0%,100% { box-shadow: 0 0 12px 4px #facc15bb, 0 0 0 0 transparent;} 50% { box-shadow: 0 0 32px 8px #facc15cc, 0 0 0 8px #fffbe7aa;} }
  .animate-vip-glow { animation: vip-glow 2.5s infinite alternate; }
  @keyframes vip-pop { 0%{ transform:scale(1.13); } 100%{ transform:scale(1); } }
  .animate-vip-pop { animation: vip-pop 0.6s cubic-bezier(.17,2,.7,1.2) both; }
  @keyframes confetti-burst { 0% { opacity:0; transform: scale(0.4) rotate(-40deg);} 60% { opacity:1; transform: scale(1.2) rotate(12deg);} 100% { opacity:0; transform: scale(0.2) rotate(60deg);} }
  .animate-vip-confetti { animation: confetti-burst 1.2s cubic-bezier(.2,1.4,.7,1.2) 1; }
  #sponsor-wall-widget[aria-hidden="false"] { opacity: 1 !important; pointer-events: auto !important; transform: translateY(0) scale(1) !important; }
  #sponsor-wall-list::-webkit-scrollbar { width: 8px;}
  #sponsor-wall-list::-webkit-scrollbar-thumb { background-color: rgba(250, 204, 21, 0.5); border-radius: 4px;}
  #sponsor-wall-list.scroll-shadow::before { content: ""; position: sticky; top: 0; height: 8px; width: 100%; background: linear-gradient(to bottom, rgba(250,204,21,0.21), transparent); pointer-events: none; z-index: 10; }
  @media (prefers-reduced-motion: reduce) { #sponsor-wall-widget, #sponsor-wall-toggle { transition: none !important; animation: none !important; } }
