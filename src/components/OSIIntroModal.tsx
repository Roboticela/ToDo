"use client";

import { useEffect } from "react";
import { createPortal } from "react-dom";
import { motion, AnimatePresence } from "framer-motion";
import { X, Layers } from "lucide-react";

interface OSIIntroModalProps {
  isOpen: boolean;
  onClose: () => void;
}

const OSI_INTRO_CONTENT = {
  whatIs: `The Open Systems Interconnection (OSI) model is a conceptual framework that describes how data is transmitted over a network. It was developed by the International Organization for Standardization (ISO) in the 1980s to standardize how different systems communicate. The model divides the process of sending and receiving data into seven distinct layers, each with a specific role. Data flows down through these layers on the sending side (encapsulation: each layer adds its header or control information) and back up on the receiving side (decapsulation: each layer removes and processes its header). This separation of concerns allows different technologies to be developed and replaced at each layer without affecting the others.`,
  layers: [
    {
      number: 7,
      name: "Application",
      text: "The Application layer is the topmost layer and the one closest to the end user. It provides network services directly to applications like web browsers, email clients, and file transfer programs. When you send an HTTP request, this layer formats it with the correct method, URL, headers, and body. It does not refer to the application itself — it defines the protocol the application uses to communicate over a network. Examples of protocols at this layer include HTTP, HTTPS, FTP, SMTP, and DNS.",
    },
    {
      number: 6,
      name: "Presentation",
      text: "The Presentation layer is the network's 'translator'. It converts data between application format and a common network format so that two systems with different encodings can understand each other. Key responsibilities include: character encoding (e.g. ASCII and Unicode), data compression to reduce size, and encryption/decryption via TLS/SSL to secure the data. When using HTTPS, TLS wraps the application data in a record that includes content type, protocol version, and payload length. This layer ensures that the data arriving at the Application layer on the receiving side is in a format the application can use.",
    },
    {
      number: 5,
      name: "Session",
      text: "The Session layer manages communication sessions — logical, persistent connections between two applications on different hosts. It establishes the session before data transfer, maintains it during communication, and terminates it gracefully when done. It also handles synchronization checkpoints so that a long transfer can resume from a known point if interrupted, rather than restarting from scratch. A unique Session ID is assigned to each session so that multiple sessions can be distinguished. Protocols such as NetBIOS, RPC, and SQL operate at this layer.",
    },
    {
      number: 4,
      name: "Transport",
      text: "The Transport layer provides reliable end-to-end delivery between processes running on different hosts, identified by port numbers. TCP (Transmission Control Protocol) adds a header with source and destination ports, sequence numbers for ordering, acknowledgment numbers for reliability, flags (e.g. SYN, ACK, PSH), window size for flow control, and a checksum for error detection. The result is called a Segment. UDP provides a simpler, faster, connectionless alternative without guaranteed delivery. This layer is responsible for ensuring that data is delivered completely and in the correct order, or for reporting errors when that is not possible.",
    },
    {
      number: 3,
      name: "Network",
      text: "The Network layer is responsible for logical addressing and routing data across multiple networks. Routers operate at this layer, reading the destination IP address in the packet header to determine the best path. The IPv4 header contains source and destination IP addresses, TTL (Time-To-Live) to prevent infinite loops, protocol field (e.g. 6 for TCP), total packet length, and a header checksum. The PDU at this layer is called a Packet. This layer enables data to travel from one network to another, across the Internet or other interconnected networks.",
    },
    {
      number: 2,
      name: "Data Link",
      text: "The Data Link layer handles reliable communication between two directly connected nodes on the same local network, using MAC (Media Access Control) addresses. It takes the IP packet, wraps it in an Ethernet frame with a header (destination MAC, source MAC, EtherType), and appends a Frame Check Sequence (FCS) for error detection using CRC. Switches and network interface cards (NICs) operate at this layer. The PDU is called a Frame. This layer is concerned with getting data from one node to the next on the same physical or logical link.",
    },
    {
      number: 1,
      name: "Physical",
      text: "The Physical layer is the lowest layer and is responsible for transmitting raw bits over a physical medium. It defines the electrical, optical, or radio signal characteristics — voltages, frequencies, pin layouts, and cable types. There is no addressing or error handling here; it simply converts the binary stream of 0s and 1s from the Data Link frame into signals and transmits them. On the receiving end, it converts signals back to bits and passes the frame up to Layer 2. Cables, connectors, hubs, and repeaters operate at this layer.",
    },
  ],
};

export default function OSIIntroModal({ isOpen, onClose }: OSIIntroModalProps) {
  useEffect(() => {
    if (!isOpen) return;
    const handleEscape = (e: KeyboardEvent) => {
      if (e.key === "Escape") onClose();
    };
    window.addEventListener("keydown", handleEscape);
    return () => window.removeEventListener("keydown", handleEscape);
  }, [isOpen, onClose]);

  if (typeof window === "undefined") return null;

  const modalContent = (
    <AnimatePresence>
      {isOpen && (
        <>
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            transition={{ duration: 0.2 }}
            className="fixed inset-0 bg-background/80 backdrop-blur-sm z-[100]"
            onClick={onClose}
          />
          <motion.div
            initial={{ opacity: 0, scale: 0.96, y: 24 }}
            animate={{ opacity: 1, scale: 1, y: 0 }}
            exit={{ opacity: 0, scale: 0.96, y: 24 }}
            transition={{ duration: 0.35, type: "spring", stiffness: 280, damping: 28 }}
            className="fixed inset-0 z-[100] flex items-center justify-center p-4 pointer-events-none"
          >
            <div
              className="w-full max-w-2xl max-h-[90vh] bg-card border border-border rounded-2xl overflow-hidden flex flex-col shadow-2xl shadow-black/10 pointer-events-auto"
              onClick={(e) => e.stopPropagation()}
            >
              {/* Header */}
              <div className="flex items-center justify-between p-5 sm:p-6 border-b border-border/80 bg-gradient-to-br from-primary/5 via-accent/5 to-transparent">
                <div className="flex items-center gap-3">
                  <motion.div
                    initial={{ scale: 0.8, opacity: 0 }}
                    animate={{ scale: 1, opacity: 1 }}
                    transition={{ delay: 0.1, type: "spring", stiffness: 400 }}
                    className="w-11 h-11 rounded-xl bg-primary/10 border border-primary/20 flex items-center justify-center"
                  >
                    <Layers className="w-5 h-5 text-primary" />
                  </motion.div>
                  <div>
                    <h2 className="text-xl sm:text-2xl font-bold text-foreground tracking-tight">
                      What is the OSI model?
                    </h2>
                    <p className="text-xs text-tertiary mt-0.5">Theoretical overview</p>
                  </div>
                </div>
                <motion.button
                  onClick={onClose}
                  whileHover={{ scale: 1.05 }}
                  whileTap={{ scale: 0.95 }}
                  className="p-2.5 rounded-xl border border-border bg-card/80 hover:bg-accent hover:border-primary/40 transition-colors"
                  aria-label="Close"
                >
                  <X className="w-5 h-5 text-foreground" />
                </motion.button>
              </div>

              {/* Content — text only */}
              <div className="flex-1 overflow-y-auto custom-scrollbar p-5 sm:p-6">
                <div className="space-y-6">
                  <motion.section
                    initial={{ opacity: 0, y: 8 }}
                    animate={{ opacity: 1, y: 0 }}
                    transition={{ delay: 0.1 }}
                  >
                    <p className="text-foreground/90 text-sm sm:text-base leading-relaxed">
                      {OSI_INTRO_CONTENT.whatIs}
                    </p>
                  </motion.section>

                  <motion.section
                    initial={{ opacity: 0, y: 8 }}
                    animate={{ opacity: 1, y: 0 }}
                    transition={{ delay: 0.15 }}
                    className="space-y-4"
                  >
                    <h3 className="text-sm font-semibold text-foreground uppercase tracking-wider flex items-center gap-2">
                      <Layers className="w-4 h-4 text-primary" />
                      The seven layers
                    </h3>
                    {OSI_INTRO_CONTENT.layers.map((layer, i) => (
                      <motion.div
                        key={layer.number}
                        initial={{ opacity: 0, x: -8 }}
                        animate={{ opacity: 1, x: 0 }}
                        transition={{ delay: 0.2 + i * 0.04 }}
                        className="rounded-xl border border-border/60 bg-muted/30 p-4"
                      >
                        <p className="text-xs font-semibold text-primary mb-1.5">
                          Layer {layer.number} — {layer.name}
                        </p>
                        <p className="text-sm text-foreground/90 leading-relaxed">
                          {layer.text}
                        </p>
                      </motion.div>
                    ))}
                  </motion.section>

                  <motion.p
                    initial={{ opacity: 0 }}
                    animate={{ opacity: 1 }}
                    transition={{ delay: 0.5 }}
                    className="text-xs text-tertiary leading-relaxed"
                  >
                    In this simulator you can see how a real message is encapsulated as it passes down through each layer (sending) and decapsulated as it passes back up (receiving).
                  </motion.p>
                </div>
              </div>
            </div>
          </motion.div>
        </>
      )}
    </AnimatePresence>
  );

  return createPortal(modalContent, document.body);
}
