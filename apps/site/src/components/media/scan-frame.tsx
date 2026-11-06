/**
 * A site picture in the radar frame (owner's canvas "image frame ideas", B + C): white mat, range rings with one amber
 * blip in the top-right corner, and a scan tag naming the topic bottom-left. Styles: `.scan-*` in `app/site.css`.
 * Renders only spans, so it can sit inside a link or a figure.
 */
export function ScanFrame({
  src,
  alt,
  width,
  height,
  tag,
  size = 'card',
  screenshot = false,
  blip = 1,
  showTag = true,
  eager = false,
  className = '',
  imgClassName = 'aspect-[3/2]',
}: {
  src: string;
  alt: string;
  width: number;
  height: number;
  /** One or two words, e.g. "Reviews". */
  tag: string;
  /** `lg`: the home page and guide-page pictures. */
  size?: 'card' | 'lg';
  /** A light product shot: blue rings, cropped from the top left. */
  screenshot?: boolean;
  /** Where the blip sits on the rings; vary it between neighbouring pictures. */
  blip?: 1 | 2 | 3;
  /** Off for small side pictures, where the tag would cover too much. */
  showTag?: boolean;
  eager?: boolean;
  /** On the mat (layout, visibility). */
  className?: string;
  /** On the image (its aspect ratio). */
  imgClassName?: string;
}) {
  return (
    <span className={`scan-mat ${size === 'lg' ? 'scan-mat-lg' : ''} ${className}`}>
      <span className="scan-win">
        <img
          src={src}
          alt={alt}
          width={width}
          height={height}
          loading={eager ? undefined : 'lazy'}
          decoding="async"
          className={`block w-full bg-muted-surface object-cover ${screenshot ? '[object-position:left_top]' : ''} ${imgClassName}`}
        />
        <span aria-hidden="true" className={`scan-rings ${screenshot ? 'scan-rings-light' : ''}`}>
          <svg viewBox="0 0 150 150">
            <circle className="r1" cx="150" cy="0" r="40" />
            <circle className="r2" cx="150" cy="0" r="78" />
            <circle className="r3" cx="150" cy="0" r="116" />
          </svg>
          <span className={`scan-blip scan-blip-${blip}`} />
        </span>
        {showTag && (
        <span className="scan-tag">
          <svg aria-hidden="true" width="16" height="16" viewBox="0 0 16 16" fill="none">
            <circle cx="8" cy="8" r="6.5" strokeOpacity=".6" />
            <circle cx="8" cy="8" r="3.5" strokeOpacity=".6" />
            <path className="scan-sweep" d="M8 8V1.5" strokeWidth="1.5" strokeLinecap="round" />
            <circle cx="11.2" cy="5" r="1.4" className="fill-amber" stroke="none" />
          </svg>
          {tag}
        </span>
        )}
      </span>
    </span>
  );
}
