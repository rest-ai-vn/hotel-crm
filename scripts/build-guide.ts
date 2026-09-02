#!/usr/bin/env bun
// Dựng cẩm nang vận hành — một file HTML tĩnh, tự chứa — từ:
//   docs/guide/template.html  khung trang, CSS, JS
//   docs/guide/shots/*.jpg    ảnh chụp giao diện (chụp bằng tài khoản demo)
// Kết quả: dist/guide/index.html, ảnh nhúng sẵn dạng data URI nên đặt ở đâu
// cũng chạy, không phụ thuộc đường dẫn ảnh trên máy chủ.
//
// Chạy: bun run docs:guide
//
// Deploy: chép dist/guide/index.html tới /opt/hotel-crm/public/huong-dan/index.html
// trên máy chủ — nginx phục vụ công khai tại https://hotel-pms.restai.vn/huong-dan
// (thư mục này nằm NGOÀI dist/web nên deploy app không xóa mất).
import { mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const ROOT = join(dirname(fileURLToPath(import.meta.url)), "..");
const SHOTS = join(ROOT, "docs/guide/shots");
const OUT_DIR = join(ROOT, "dist/guide");
const HOST = "hotel-pms.restai.vn";

/** Kích thước thật đọc từ marker SOF của JPEG, để ảnh không làm nhảy layout. */
function jpegSize(buf: Buffer): { width: number; height: number } {
  let i = 2;
  while (i < buf.length - 9) {
    if (buf[i] !== 0xff) {
      i += 1;
      continue;
    }
    const marker = buf[i + 1]!;
    const isSof =
      (marker >= 0xc0 && marker <= 0xc3) ||
      (marker >= 0xc5 && marker <= 0xc7) ||
      (marker >= 0xc9 && marker <= 0xcb) ||
      (marker >= 0xcd && marker <= 0xcf);
    if (isSof) return { height: buf.readUInt16BE(i + 5), width: buf.readUInt16BE(i + 7) };
    i += 2 + buf.readUInt16BE(i + 2);
  }
  throw new Error("Không đọc được kích thước JPEG");
}

function shot(name: string, alt: string, caption: string, path: string): string {
  const buf = readFileSync(join(SHOTS, `${name}.jpg`));
  const { width, height } = jpegSize(buf);
  return `<figure class="shot">
  <div class="frame">
    <div class="chrome"><span class="dot"></span><span class="dot"></span><span class="dot"></span><span class="addr">${HOST}${path}</span></div>
    <button class="zoom" type="button" aria-label="Phóng to ảnh ${alt}">
      <img src="data:image/jpeg;base64,${buf.toString("base64")}" alt="${alt}" width="${width}" height="${height}" loading="lazy" decoding="async">
    </button>
  </div>
  <figcaption>${caption}</figcaption>
</figure>`;
}

interface Chapter {
  id: string;
  kicker: string;
  title: string;
  lede: string;
  blocks: string[];
}

const CHAPTERS: Chapter[] = [
  {
    id: "dang-nhap",
    kicker: "Bắt đầu",
    title: "Đăng nhập",
    lede: "Mỗi người một tài khoản riêng, không dùng chung — để mỗi thao tác gắn đúng với người thực hiện.",
    blocks: [
      shot("01-login", "Màn hình đăng nhập Hotel PMS", `Cổng quản trị tại <code>${HOST}</code>.`, "/login"),
      `<ol class="steps">
  <li>Mở <b>${HOST}</b> trên trình duyệt.</li>
  <li>Nhập <b>email</b> và <b>mật khẩu</b> khách sạn đã cấp cho bạn.</li>
  <li>Bấm <b>Đăng nhập</b>. Vào xong, đổi mật khẩu ngay ở nút <b>Đổi mật khẩu</b> góc dưới trái.</li>
</ol>
<div class="note stop">
  <p class="note-t">Sai mật khẩu 5 lần</p>
  <p>Tài khoản bị tạm khóa 15 phút để chặn dò mật khẩu. Chờ hết 15 phút hoặc nhờ quản lý đặt lại mật khẩu.</p>
</div>`,
    ],
  },
  {
    id: "tong-quan",
    kicker: "Hằng ngày",
    title: "Tổng quan",
    lede: "Màn hình đầu ca. Nhìn năm con số trên cùng là biết hôm nay khách sạn đang ở tình trạng nào.",
    blocks: [
      shot("02-dashboard", "Trang Tổng quan với các chỉ số trong ngày",
        "Chỉ số trong ngày, tình trạng phòng, và danh sách khách nhận/trả phòng hôm nay.", "/"),
      `<div class="kpis">
  <div class="kpi"><b>Công suất</b><span>Bao nhiêu phần trăm phòng đang có khách. <i>13% = 1/8 phòng</i></span></div>
  <div class="kpi"><b>Khách lưu trú</b><span>Số lượt khách đang ở trong khách sạn ngay lúc này.</span></div>
  <div class="kpi"><b>Nhận phòng hôm nay</b><span>Số khách dự kiến đến, kèm danh sách bên dưới.</span></div>
  <div class="kpi"><b>Trả phòng hôm nay</b><span>Số khách phải trả phòng — dùng để nhắc thu tiền.</span></div>
  <div class="kpi"><b>Doanh thu hôm nay</b><span>Tiền <i>dự kiến</i> của đặt phòng trong ngày, chưa phải tiền đã thu.</span></div>
</div>
<p>Dưới cùng có hai lối tắt <b>→ Quản lý đặt phòng</b> và <b>→ Buồng phòng</b>.</p>
<div class="note ok">
  <p class="note-t">Thói quen tốt</p>
  <p>Đầu ca mở Tổng quan, đọc hai danh sách <b>Nhận phòng</b> và <b>Trả phòng hôm nay</b>, rồi mới làm việc khác.</p>
</div>`,
    ],
  },
  {
    id: "lich",
    kicker: "Hằng ngày",
    title: "Lịch — sơ đồ đặt phòng",
    lede: "Lưới 14 ngày: mỗi hàng một phòng, mỗi cột một ngày. Đây cũng là nơi gán phòng cho khách bằng cách kéo-thả.",
    blocks: [
      shot("03-calendar", "Sơ đồ đặt phòng dạng lưới 14 ngày, có khay booking chưa gán phòng",
        "Khay <b>Chưa gán phòng</b> nằm trên cùng; bên dưới là lưới phòng × ngày.", "/calendar"),
      `<ol class="steps">
  <li>Dùng <b>←</b> / <b>→</b> để lùi hoặc tiến khung 14 ngày, ô ngày để nhảy tới một mốc bất kỳ, <b>Hôm nay</b> để quay về hiện tại.</li>
  <li>Booking chưa có phòng cụ thể nằm ở khay <b>Chưa gán phòng</b> trên cùng — <b>kéo</b> nó xuống hàng phòng muốn xếp.</li>
  <li><b>Kéo</b> một booking sang hàng khác để đổi phòng, hoặc sang trái/phải để dời ngày.</li>
</ol>
<div class="legend">
  <span class="pill s-book">Đã xác nhận</span><span class="ldesc">khách đã đặt, chưa nhận phòng</span>
  <span class="pill s-free">Đang ở</span><span class="ldesc">khách đang trong phòng</span>
  <span class="pill s-clean">Đã trả</span><span class="ldesc">lượt ở đã kết thúc</span>
</div>
<p>Biểu tượng 👥 trên một booking nghĩa là khách <b>đoàn</b> — nhiều phòng chung một mã nhóm.</p>
<div class="note warn">
  <p class="note-t">Ngày trả phòng không tính là bận</p>
  <p>Khách trả phòng ngày 12 thì <b>ngày 12 phòng đó đã trống</b> và bán lại được ngay. Sơ đồ, đặt phòng và trợ lý AI đều tính giống nhau.</p>
</div>`,
    ],
  },
  {
    id: "phong",
    kicker: "Hằng ngày",
    title: "Phòng",
    lede: "Sơ đồ phòng theo tầng. Màu ô cho biết phòng đang ở tình trạng nào; bấm vào ô để đổi.",
    blocks: [
      shot("04-rooms", "Sơ đồ phòng xếp theo tầng, tô màu theo trạng thái",
        "Phòng xếp theo tầng. Bấm một dải màu ở trên để lọc nhanh, hoặc tìm theo số phòng.", "/rooms"),
      `<div class="legend">
  <span class="pill s-free">Trống</span><span class="ldesc">sạch, bán được ngay</span>
  <span class="pill s-book">Đã đặt</span><span class="ldesc">đã có khách giữ chỗ</span>
  <span class="pill s-occ">Đang ở</span><span class="ldesc">khách đang trong phòng</span>
  <span class="pill s-clean">Đang dọn</span><span class="ldesc">chờ buồng phòng làm sạch</span>
  <span class="pill s-maint">Bảo trì</span><span class="ldesc">đang sửa, không bán</span>
  <span class="pill s-oos">Hỏng</span><span class="ldesc">không dùng được</span>
</div>
<h3>Thêm loại phòng và thêm phòng</h3>
<ol class="steps">
  <li>Cuối trang, bảng <b>Loại phòng của cơ sở</b> → nút <b>+ Thêm loại phòng</b>: đặt tên, mã (VD <code>DLX</code>), sức chứa, mô tả.</li>
  <li>Ngay dưới bảng là ô <b>+ Thêm phòng nhanh</b>: nhập <b>số phòng</b>, <b>tầng</b>, chọn <b>loại</b> rồi bấm <b>Thêm</b>.</li>
  <li>Tạo loại phòng mới thì sang <b>Bảng giá</b> đặt giá ngay, nếu không loại đó chưa bán được.</li>
</ol>
<h3>Đổi trạng thái và xóa phòng</h3>`,
      shot("04b-room-modal", "Bảng chọn trạng thái phòng, có nút Xóa phòng",
        "Bấm vào ô phòng để mở bảng này. Nút <b>Xóa phòng</b> chỉ hiện với quản trị và quản lý.", "/rooms"),
      `<ol class="steps">
  <li>Bấm vào ô phòng cần sửa.</li>
  <li>Chọn trạng thái mới. Chọn <b>Trống</b> đồng thời ghi lại mốc vừa dọn xong.</li>
  <li>Muốn bỏ hẳn một phòng: bấm <b>🗑 Xóa phòng</b> rồi xác nhận.</li>
</ol>
<div class="note warn">
  <p class="note-t">Xóa phòng được xử lý ra sao</p>
  <ul>
    <li>Phòng <b>đang có khách</b> hoặc <b>còn đặt phòng giữ chỗ</b> → <b>không cho xóa</b>, hệ thống nói rõ lý do.</li>
    <li>Phòng <b>từng có khách ở</b> → chuyển sang <i>ngừng sử dụng</i>: biến mất khỏi sơ đồ, không tính vào phòng trống, nhưng hóa đơn và báo cáo cũ vẫn nguyên.</li>
    <li>Phòng <b>chưa dùng lần nào</b> → xóa hẳn.</li>
  </ul>
</div>`,
    ],
  },
  {
    id: "dat-phong",
    kicker: "Hằng ngày",
    title: "Đặt phòng",
    lede: "Toàn bộ vòng đời một lượt khách: giữ chỗ → nhận phòng → phát sinh dịch vụ → thu tiền → trả phòng.",
    blocks: [
      shot("05-reservations", "Danh sách đặt phòng với bộ lọc theo ngày và trạng thái",
        "Mỗi dòng một đặt phòng, kèm mã xác nhận dạng <code>BON-260817-D49</code>.", "/reservations"),
      `<ol class="steps">
  <li><b>Tạo đặt phòng</b> — nút xanh góc phải. Chọn khách (hoặc nhập khách mới), loại phòng, ngày nhận và ngày trả. Hệ thống tự tính tiền theo bảng giá, gồm phụ thu cuối tuần và giá ngày lễ.</li>
  <li><b>Nhận phòng</b> — đến ngày khách tới, mở đặt phòng, bấm <b>Nhận phòng</b> rồi gán số phòng cụ thể. Phòng đó tự chuyển sang <i>Đang ở</i>.</li>
  <li><b>Trong lúc khách ở</b> — thêm <b>Dịch vụ</b>, <b>Thanh toán</b> (thu đủ hoặc <b>Thanh toán 1 phần</b>), <b>Đổi phòng</b>, <b>Gia hạn</b> thêm đêm.</li>
  <li><b>Trả phòng</b> — bấm <b>Trả phòng</b>. Phòng tự chuyển sang <i>Đang dọn</i>, lượt ở cộng vào lịch sử của khách.</li>
  <li><b>In phiếu</b> cho từng khách, hoặc <b>In phiếu đoàn</b> khi khách đi nhóm nhiều phòng.</li>
</ol>
<div class="note ok">
  <p class="note-t">Khách đặt rồi không đến</p>
  <p>Dùng <b>Không đến</b> thay vì hủy. Nếu khách đã cọc, chọn giữ lại tiền cọc — khoản đó được ghi nhận thành doanh thu thay vì biến mất khỏi sổ.</p>
</div>
<div class="note stop">
  <p class="note-t">Không thể đặt trùng phòng</p>
  <p>Hệ thống chặn ngay ở tầng cơ sở dữ liệu: hai lượt khách không thể cùng giữ một phòng vào những đêm chồng nhau, kể cả khi hai lễ tân bấm cùng lúc.</p>
</div>`,
    ],
  },
  {
    id: "khach-hang",
    kicker: "Hằng ngày",
    title: "Khách hàng",
    lede: "Hồ sơ khách dùng chung cho cả khách sạn: nhớ tên, số điện thoại, giấy tờ và lịch sử lưu trú.",
    blocks: [
      shot("06-guests", "Danh sách khách hàng và ô tìm kiếm", "Tìm theo tên, số điện thoại hoặc Zalo ID.", "/guests"),
      `<ol class="steps">
  <li>Gõ tên hoặc số điện thoại vào ô tìm kiếm. Khách cũ hiện ra kèm số lần đã ở.</li>
  <li>Mở hồ sơ để bổ sung <b>CCCD/hộ chiếu</b> và địa chỉ — dữ liệu này dùng cho báo cáo khai báo lưu trú.</li>
  <li>Khách công ty: khai báo ở mục <b>Công ty</b> phía dưới (tên, mã số thuế, chiết khấu %) để mọi đặt phòng của công ty đó tự áp dụng mức giảm.</li>
</ol>
<div class="note warn">
  <p class="note-t">Số điện thoại là chìa khóa</p>
  <p>Hệ thống nhận ra khách cũ bằng số điện thoại. Nhập đúng ngay từ đầu thì lịch sử lưu trú và hạng thành viên mới cộng dồn đúng người.</p>
</div>`,
    ],
  },
  {
    id: "buong-phong",
    kicker: "Hằng ngày",
    title: "Buồng phòng",
    lede: "Dành cho tổ buồng: phòng nào cần dọn, ai phụ trách, đồ khách để quên và phiếu báo hỏng.",
    blocks: [
      shot("07-housekeeping", "Trang buồng phòng với danh sách phòng cần dọn",
        "Nhân viên buồng phòng đăng nhập chỉ thấy đúng trang này.", "/housekeeping"),
      `<ol class="steps">
  <li>Phòng khách vừa trả tự nhảy sang <b>Đang dọn</b>.</li>
  <li>Phân công nhân viên phụ trách từng phòng.</li>
  <li>Dọn xong chuyển phòng về <b>Trống</b> — lúc đó phòng mới bán lại được.</li>
  <li>Đồ khách để quên ghi vào <b>Đồ thất lạc</b> (món đồ, nơi nhặt); hỏng hóc mở <b>Phiếu bảo trì</b>, có thể khóa luôn phòng sang <i>Bảo trì</i>.</li>
</ol>`,
    ],
  },
  {
    id: "dich-vu",
    kicker: "Hằng ngày",
    title: "Dịch vụ",
    lede: "Ăn sáng, giặt ủi, minibar, đưa đón… khai báo một lần rồi tính vào hóa đơn phòng.",
    blocks: [
      shot("08-services", "Danh mục dịch vụ và bảng giá dịch vụ",
        "Danh mục dịch vụ của cơ sở, có đơn giá và đơn vị tính.", "/services"),
      `<ol class="steps">
  <li>Khai báo dịch vụ một lần: tên, nhóm, đơn giá, đơn vị (suất, kg, lon, lần…).</li>
  <li>Khi khách dùng, mở đặt phòng của khách và thêm dịch vụ kèm số lượng.</li>
  <li>Tiền dịch vụ cộng vào hóa đơn, hiện ra khi trả phòng.</li>
</ol>`,
    ],
  },
  {
    id: "thu-chi",
    kicker: "Hằng ngày",
    title: "Thu chi",
    lede: "Sổ quỹ tiền mặt: mọi khoản thu và chi ngoài tiền phòng đều ghi ở đây.",
    blocks: [
      shot("09-cashbook", "Sổ thu chi theo ngày", "Thu chi trong ngày, phân theo nhóm.", "/cashbook"),
      `<ol class="steps">
  <li>Chọn <b>Thu</b> hoặc <b>Chi</b>, nhập nhóm (điện nước, taxi, mua đồ…), số tiền và ghi chú.</li>
  <li>Ghi ngay lúc phát sinh — cuối ca đếm tiền mới khớp.</li>
</ol>`,
    ],
  },
  {
    id: "giao-ca",
    kicker: "Cuối ca",
    title: "Giao ca",
    lede: "Mở ca khi vào làm, đóng ca khi ra về. Hệ thống tự so tiền đếm được với tiền lẽ ra phải có.",
    blocks: [
      shot("10-shifts", "Màn hình mở ca và đóng ca", "Mỗi cơ sở chỉ có một ca đang mở tại một thời điểm.", "/shifts"),
      `<ol class="steps">
  <li><b>Mở ca</b> — nhập số tiền mặt có sẵn trong két đầu ca.</li>
  <li>Làm việc bình thường suốt ca.</li>
  <li><b>Đóng ca</b> — đếm tiền thật trong két rồi nhập vào. Hệ thống hiện chênh lệch giữa tiền đếm và tiền tính toán.</li>
</ol>
<div class="note warn">
  <p class="note-t">Lệch tiền thì ghi chú, đừng sửa số</p>
  <p>Nhập đúng số đếm được và ghi lý do vào ô ghi chú bàn giao — đó mới là thứ quản lý cần đọc lại.</p>
</div>`,
    ],
  },
  {
    id: "chot-ngay",
    kicker: "Cuối ca",
    title: "Chốt ngày",
    lede: "Khóa sổ một ngày nghiệp vụ. Sau khi chốt, số liệu ngày đó dùng làm căn cứ cho báo cáo.",
    blocks: [
      shot("11-night-audit", "Màn hình chốt ngày", "Mỗi ngày chốt đúng một lần cho mỗi cơ sở.", "/night-audit"),
      `<ol class="steps">
  <li>Cuối ngày, kiểm tra đã trả phòng hết cho khách rời đi và đã đánh dấu khách không đến.</li>
  <li>Bấm chốt ngày. Hệ thống ghi lại doanh thu, công suất và số khách của ngày đó.</li>
</ol>
<div class="note stop">
  <p class="note-t">Chỉ quản trị và quản lý</p>
  <p>Lễ tân không thấy mục này. Chốt xong thì số liệu ngày đó đã được ghi nhận, sửa lại rất phiền — kiểm kỹ trước khi bấm.</p>
</div>`,
    ],
  },
  {
    id: "bao-cao",
    kicker: "Quản lý",
    title: "Báo cáo",
    lede: "Doanh thu, công suất, ADR, RevPAR và khai báo lưu trú — xem trên màn hình hoặc xuất ra file.",
    blocks: [
      shot("12-reports", "Trang báo cáo với các chỉ số theo khoảng thời gian",
        "Chọn khoảng ngày rồi đọc theo từng nhóm chỉ số.", "/reports"),
      `<ul class="bullets">
  <li><b>Doanh thu · Công suất · ADR · RevPAR</b> theo khoảng ngày. <i>ADR</i> là giá phòng bình quân bán ra; <i>RevPAR</i> là doanh thu bình quân trên mỗi phòng hiện có — nhìn RevPAR biết vừa bán được giá vừa lấp được phòng hay không.</li>
  <li><b>Cơ cấu</b> theo nguồn khách, loại phòng, nhân viên, quốc tịch — biết tiền đến từ đâu.</li>
  <li><b>Khai báo lưu trú</b> — danh sách khách kèm giấy tờ, để nộp cho công an khu vực.</li>
  <li><b>Xuất Excel</b> hoặc CSV để gửi kế toán.</li>
</ul>
<p>Tài khoản quản trị còn thấy thêm bảng <b>doanh thu gộp theo cơ sở</b> trong kỳ.</p>`,
    ],
  },
  {
    id: "bang-gia",
    kicker: "Quản lý",
    title: "Bảng giá",
    lede: "Giá phòng, phụ thu cuối tuần, giá ngày lễ và mã giảm giá. Đặt đúng ở đây thì mọi nơi khác tự tính đúng.",
    blocks: [
      shot("13-rate-plans", "Bảng giá theo loại phòng và kiểu đặt",
        "Bảng giá, giá ngày lễ và voucher nằm chung một trang.", "/rate-plans"),
      `<ol class="steps">
  <li><b>Bảng giá</b> — mỗi loại phòng × mỗi kiểu đặt (theo giờ / qua đêm / nghỉ ngày) một bảng giá, đặt được cả phụ thu cuối tuần theo phần trăm.</li>
  <li><b>Giá ngày lễ</b> — khai báo theo ngày cụ thể: phụ thu phần trăm, hoặc giá cố định thay hẳn giá thường.</li>
  <li><b>Voucher</b> — mã giảm theo phần trăm hoặc số tiền, có hạn dùng và giới hạn lượt.</li>
</ol>
<div class="note stop">
  <p class="note-t">Loại phòng chưa có bảng giá thì không bán được</p>
  <p>Đặt phòng và trợ lý AI đều báo <i>chưa có giá</i> cho loại phòng đó. Tạo loại phòng mới thì tạo bảng giá ngay.</p>
</div>`,
    ],
  },
  {
    id: "tich-hop-ai",
    kicker: "Quản lý",
    title: "Tích hợp AI",
    lede: "Cấp chìa khóa cho trợ lý AI — chatbot Zalo, Facebook, tổng đài — tự tra phòng trống và đặt phòng vào đúng khách sạn của bạn.",
    blocks: [
      shot("14-ai", "Trang Tích hợp AI với danh sách API key",
        "Tạo key, xem lần dùng gần nhất, khóa key khi cần.", "/ai-integration"),
      `<ol class="steps">
  <li>Đặt tên key theo nơi dùng, ví dụ <i>Bot Zalo lễ tân</i> — sau này nhìn tên là biết khóa cái nào.</li>
  <li>Chọn quyền: <code>read</code> để tra phòng trống và báo giá, <code>book</code> để đặt và hủy phòng.</li>
  <li>Bấm <b>Tạo key</b> rồi <b>sao chép ngay</b>.</li>
  <li>Dán vào cấu hình bot. Khi nghi bị lộ, bấm <b>Khóa</b> và tạo key mới.</li>
</ol>
<div class="note stop">
  <p class="note-t">Key chỉ hiện đúng một lần</p>
  <p>Hệ thống chỉ lưu bản băm, không lưu chuỗi gốc — không ai xem lại được, kể cả quản trị. Mất thì tạo key mới.</p>
</div>
<h3>Bot gọi vào như thế nào</h3>
<p>Gửi key qua header <code>X-API-Key</code>. Giá và số phòng trống luôn được máy chủ tính lại, nên AI không thể tự bịa giá hay đặt vượt số phòng thật.</p>
<pre><code># Tra phòng trống + giá
curl -H "X-API-Key: hk_..." \\
  "https://${HOST}/api/ai/availability?check_in=2026-09-10&amp;check_out=2026-09-12"

# Đặt phòng
curl -X POST -H "X-API-Key: hk_..." -H "Content-Type: application/json" \\
  -d '{"room_type_code":"CB200","check_in":"2026-09-10","check_out":"2026-09-12",
       "guest_name":"Nguyễn Văn A","guest_phone":"0905111222",
       "source":"zalo","idempotency_key":"zalo-msg-123456"}' \\
  "https://${HOST}/api/ai/bookings"</code></pre>
<div class="note ok">
  <p class="note-t">Luôn gửi <code>idempotency_key</code></p>
  <p>Dùng id tin nhắn làm khóa. Bot lỡ gọi lại hai lần thì hệ thống trả về đúng đặt phòng cũ thay vì đặt trùng cho khách.</p>
</div>
<p class="fineprint">Người lập trình bot lấy mô tả đầy đủ tại <code>/api/ai/tools.json</code> — dán thẳng vào function-calling của Gemini/OpenAI/Claude — và <code>/api/ai/openapi.json</code>.</p>`,
    ],
  },
  {
    id: "tra-nhanh",
    kicker: "Phụ lục",
    title: "Tra nhanh",
    lede: "Ai thấy được gì, và trợ lý AI báo lỗi thì nghĩa là sao.",
    blocks: [
      `<h3>Vai trò tài khoản</h3>
<div class="tablewrap">
<table>
  <thead><tr><th>Vai trò</th><th>Thấy được</th></tr></thead>
  <tbody>
    <tr><td><b>Quản trị</b><br><span class="dim">admin</span></td><td>Toàn bộ nền tảng — <b>mọi khách sạn</b>, không riêng cơ sở của mình. Chỉ dành cho người vận hành hệ thống.</td></tr>
    <tr><td><b>Quản lý</b><br><span class="dim">manager</span></td><td>Trọn vẹn <b>một cơ sở</b>: vận hành, bảng giá, chốt ngày, báo cáo, tích hợp AI.</td></tr>
    <tr><td><b>Lễ tân</b><br><span class="dim">receptionist</span></td><td>Vận hành hằng ngày: phòng, đặt phòng, khách, dịch vụ, thu chi, giao ca. Không vào bảng giá, chốt ngày, báo cáo.</td></tr>
    <tr><td><b>Buồng phòng</b><br><span class="dim">housekeeping</span></td><td>Chỉ trang Buồng phòng.</td></tr>
  </tbody>
</table>
</div>
<h3>Trợ lý AI báo lỗi</h3>
<div class="tablewrap">
<table>
  <thead><tr><th>Mã</th><th>Nghĩa là</th><th>Xử lý</th></tr></thead>
  <tbody>
    <tr><td><code>sold_out</code></td><td>Hết phòng loại đó trong khoảng ngày</td><td>Hệ thống gửi kèm loại phòng khác còn trống để bot mời khách</td></tr>
    <tr><td><code>no_rate_plan</code></td><td>Loại phòng chưa có bảng giá</td><td>Vào <b>Bảng giá</b> tạo giá cho loại phòng đó</td></tr>
    <tr><td><code>capacity_exceeded</code></td><td>Phòng không đủ chỗ cho số khách</td><td>Kiểm tra sức chứa loại phòng trong <b>Phòng</b></td></tr>
    <tr><td><code>check_in_in_past</code></td><td>Ngày nhận phòng đã qua</td><td>Bot cần hỏi lại ngày</td></tr>
    <tr><td><code>phone_mismatch</code></td><td>Hủy phòng nhưng số điện thoại không khớp</td><td>Đúng như thiết kế — chặn người lạ hủy phòng của khách</td></tr>
    <tr><td><code>invalid_api_key</code><br><code>expired_api_key</code></td><td>Key sai, bị khóa hoặc hết hạn</td><td>Vào <b>Tích hợp AI</b> kiểm tra và tạo key mới</td></tr>
    <tr><td><code>insufficient_scope</code></td><td>Key không có quyền <code>book</code></td><td>Tạo key mới có tích cả <code>read</code> và <code>book</code></td></tr>
  </tbody>
</table>
</div>
<h3>Ghi nhớ nhanh</h3>
<ul class="bullets">
  <li>Ngày trả phòng <b>không</b> tính là ngày bận — bán lại được ngay.</li>
  <li>Loại phòng không có <b>phòng thực tế</b> thì luôn báo hết, dù đã có bảng giá.</li>
  <li>Mã đặt phòng có dạng <code>BON-260910-A1B</code> — đọc cho khách là mã này.</li>
</ul>`,
    ],
  },
];

const pad = (n: number) => String(n).padStart(2, "0");

const nav = CHAPTERS.map(
  (c, i) => `      <li><a href="#${c.id}"><span class="num">${pad(i + 1)}</span>${c.title}</a></li>`,
).join("\n");

const body = CHAPTERS.map(
  (c, i) => `<section id="${c.id}" class="ch">
  <header class="ch-head">
    <p class="kicker">${c.kicker}</p>
    <h2><span class="ch-num">${pad(i + 1)}</span>${c.title}</h2>
    <p class="lede">${c.lede}</p>
  </header>
${c.blocks.join("\n")}
</section>`,
).join("\n");

// Bản standalone phải TỰ khai báo charset: khi phục vụ như file tĩnh không có
// khung <head> nào chèn hộ, thiếu dòng này là vỡ hết dấu tiếng Việt.
const html =
  '<meta charset="utf-8">\n' +
  readFileSync(join(ROOT, "docs/guide/template.html"), "utf8")
    .replace("NAVHERE", nav)
    .replace("BODYHERE", body)
    .replace("SOCHUONG", String(CHAPTERS.length));

mkdirSync(OUT_DIR, { recursive: true });
const outPath = join(OUT_DIR, "index.html");
writeFileSync(outPath, html, "utf8");

console.log(`✓ ${CHAPTERS.length} chương → ${outPath}`);
console.log(`  ${(Buffer.byteLength(html) / 1024 / 1024).toFixed(2)} MB (ảnh nhúng sẵn)`);
