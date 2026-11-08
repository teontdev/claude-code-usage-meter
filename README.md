# usage-meter — context & quota bars for Claude Code

Một "mod" (plugin) cho Claude Code hiển thị ngay **trên khung chat** ba thanh tiến độ nhỏ, cập nhật liên tục:

![usage-meter screenshot](docs/screenshot.png)

(Khối xanh lá = đã dùng, khối trắng = còn lại.)

| Thanh | Ý nghĩa |
|---|---|
| `◴ 20% • 204k/1000k` + nút **Compact** | **Context window**: % đã dùng, số token đang dùng / kích thước cửa sổ context của model. Nút Compact chạy lệnh `/compact` |
| `⚡63% • ↻ 2:50 PM` | **Quota 5 giờ**: % đã dùng và giờ reset (theo giờ máy) |
| `⚡56% • ↻ Fri 12:00 PM` | **Quota tuần**: % đã dùng, thứ và giờ reset (theo giờ máy) |

- Mỗi thanh gồm 20 khối (mỗi khối = 5%). Khi thu nhỏ cửa sổ, các khối co lại đều nhau, chữ không bị xuống dòng.
- Dàn đều hết chiều ngang khung chat, canh lề theo thanh trạng thái phía trên.
- **Realtime**: cập nhật sau mỗi response của model (kể cả giữa một turn), sau mỗi turn, và khi quota nhích 1%.
- Nút **Compact** chạy `/compact` như gõ tay (chờ Claude trả lời xong mới bấm được).
- Chạy được ở cả terminal và app desktop (tab Code).

## Cài đặt

Thay `<owner>` bằng tài khoản GitHub chứa repo này.

Trong một phiên Claude Code ở terminal:

```
/plugin install usage-meter --marketplace <owner>/claude-code-usage-meter
```

Hoặc từ shell:

```bash
claude plugin install usage-meter --marketplace <owner>/claude-code-usage-meter
```

Trong app desktop (nơi `/plugin` không chạy): bấm **+** cạnh ô chat → **Plugins** → **Add marketplace** nhập `<owner>/claude-code-usage-meter` → **Add plugin**.

Khi được hỏi `Add marketplace?` chọn `y`, rồi chọn phạm vi (scope) cài đặt.

## Lưu ý

- **Quota 5h / tuần** chỉ có khi dùng Claude theo gói subscription; trước response đầu tiên (hoặc khi dùng API key) hiện `--`.
- Thông tin quota do API báo về trong mỗi response, nên giữa hai response số không đổi.
- Giờ reset hiển thị theo múi giờ của máy bạn.
- Mod dùng API mod của Claude Code (đang ở giai đoạn early access, có thể đổi giữa các bản). Viết và kiểm tra trên Claude Code 2.1.317.
- Trên desktop, mod vẽ ở dải phía trên ô chat (`AbovePrompt`); chưa đặt được cạnh ô chọn model.

## Phát triển

```bash
claude plugin validate .
claude plugin test .
```

Chạy thử từ thư mục mã nguồn mà không cần cài:

```bash
claude --plugin-dir .
```

Mã nguồn chính: [`hooks/register.tsx`](hooks/register.tsx). Test: [`tests/bars.test.tsx`](tests/bars.test.tsx).

## English summary

`usage-meter` is a Claude Code mod that draws three slim progress bars above the chat box: context window usage (percent and tokens used / window), 5-hour quota, and weekly quota, with reset times in local time. It updates after every model response. Quota bars need a Claude subscription plan; otherwise they show `--`. Install with `/plugin install usage-meter --marketplace <owner>/claude-code-usage-meter`.

## License

[MIT](LICENSE)
