import type { Feature } from "../feature";
import buttonHandlers from "./buttons";

export default {
  name: "voice",
  register: async () => {},
  buttonHandlers,
} satisfies Feature;
