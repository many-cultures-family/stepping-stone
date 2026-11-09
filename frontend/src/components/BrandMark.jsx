// 디딤돌 로고: 'SS'가 새겨진 징검돌 (제공 이미지 legend-logo.png 를 여백만 잘라 public/brand/logo.png 로 둠)
export default function BrandMark({ size = 32, title }) {
  return (
    <img
      src="/brand/logo.png"
      width={size}
      height={size}
      alt={title ?? ''}
      aria-hidden={title ? undefined : true}
      draggable={false}
      style={{ display: 'block', flexShrink: 0, objectFit: 'contain' }}
    />
  )
}
