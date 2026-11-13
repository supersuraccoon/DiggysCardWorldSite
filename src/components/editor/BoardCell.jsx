// 关卡格子预览：卡背（当前主题 terrain_back）+ 正面（空地 / 30% 散落地形 / 墙坑楼梯）。
// 只负责外观，不改 cell.ground。
export default function BoardCellArt({ back, face }) {
  return (
    <>
      {back && <img className="le-card-back" src={back} alt="" draggable={false} />}
      {face && <img className="le-card-face" src={face} alt="" draggable={false} />}
    </>
  );
}
