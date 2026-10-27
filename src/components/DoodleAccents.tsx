import React from 'react';

export function DoodleUnderline({ className = 'w-44 h-4' }: { className?: string }) {
  return (
    <svg
      viewBox="0 0 240 22"
      fill="none"
      xmlns="http://www.w3.org/2000/svg"
      className={className}
      aria-hidden="true"
    >
      <path
        d="M4 13.5C52 5.5 128 3.5 235 10.5C168 12.5 92 15.5 18 18.5C75 17.5 148 15.5 212 16.5"
        stroke="currentColor"
        strokeWidth="3.2"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
    </svg>
  );
}

export function DoodleStar({ className = 'w-6 h-6' }: { className?: string }) {
  return (
    <svg
      viewBox="0 0 40 40"
      fill="none"
      xmlns="http://www.w3.org/2000/svg"
      className={className}
      aria-hidden="true"
    >
      <path
        d="M20 3.5C21.5 11.2 23.4 13.8 35.5 15.2C25.8 19.6 24.5 22.8 28.2 33.8C19.8 26.8 17.2 26.9 9.5 33.2C12.8 22.5 11.6 19.4 3.5 14.2C14.2 13.4 16.8 11.1 20 3.5Z"
        fill="#FBBF24"
        fillOpacity="0.38"
        stroke="currentColor"
        strokeWidth="2.6"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
    </svg>
  );
}

export function DoodleSparkleCluster({ className = 'w-8 h-8' }: { className?: string }) {
  return (
    <svg
      viewBox="0 0 48 48"
      fill="none"
      xmlns="http://www.w3.org/2000/svg"
      className={className}
      aria-hidden="true"
    >
      <path
        d="M22 6C23 15 26 18 35 19C26 21 23 24 22 33C20 24 17 21 8 19C17 18 20 15 22 6Z"
        fill="#34D399"
        fillOpacity="0.3"
        stroke="currentColor"
        strokeWidth="2.5"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
      <path
        d="M38 28C38.5 32 40 33.5 44 34C40 34.5 38.5 36 38 40C37.5 36 36 34.5 32 34C36 33.5 37.5 32 38 28Z"
        fill="#FBBF24"
        fillOpacity="0.45"
        stroke="currentColor"
        strokeWidth="2.2"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
    </svg>
  );
}

export function DoodleNotebookSpiral({ className = 'w-full h-5' }: { className?: string }) {
  return (
    <svg
      viewBox="0 0 400 22"
      fill="none"
      xmlns="http://www.w3.org/2000/svg"
      className={className}
      aria-hidden="true"
    >
      {Array.from({ length: 16 }).map((_, idx) => {
        const x = 16 + idx * 24;
        return (
          <g key={idx}>
            <circle cx={x} cy="15" r="3.5" fill="currentColor" fillOpacity="0.28" />
            <path
              d={`M${x - 2} 2 C${x - 6} 8, ${x + 6} 8, ${x} 15`}
              stroke="currentColor"
              strokeWidth="2.4"
              strokeLinecap="round"
            />
          </g>
        );
      })}
    </svg>
  );
}

export function DoodleSpeechBurst({ className = 'w-7 h-7' }: { className?: string }) {
  return (
    <svg
      viewBox="0 0 40 40"
      fill="none"
      xmlns="http://www.w3.org/2000/svg"
      className={className}
      aria-hidden="true"
    >
      <path
        d="M6 18C5.5 10.5 12 6 21 6.5C30 7 35 11.5 34.5 19C34 26.5 27.5 30.5 19 30C15.5 29.8 12.5 31.5 8.5 34C9.8 30 9.5 27.5 7.8 25C6.5 23 6.2 20.5 6 18Z"
        fill="#FEF08A"
        fillOpacity="0.45"
        stroke="currentColor"
        strokeWidth="2.5"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
    </svg>
  );
}
