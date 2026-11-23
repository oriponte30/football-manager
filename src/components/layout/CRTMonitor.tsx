import type { ReactNode } from 'react';

interface Props {
  title?: string;
  right?: ReactNode;
  children: ReactNode;
  className?: string;
  bodyClassName?: string;
  page?: string;
}

/** Reusable chunky 90s Teletext/CRT monitor. */
export default function CRTMonitor({ title, right, children, className = '', bodyClassName = '', page }: Props) {
  return (
    <div className={`crt-bezel ${className}`}>
      <div className="crt h-full">
        <div className="crt-content h-full flex flex-col">
          {title && (
            <div className="crt-header flex items-center justify-between px-3 py-[2px] text-[19px]">
              <span>{page && <span className="mr-3">P{page}</span>}{title}</span>
              {right}
            </div>
          )}
          <div className={`flex-1 p-3 ${bodyClassName}`}>{children}</div>
        </div>
      </div>
    </div>
  );
}
