FROM python:3.11

WORKDIR /app
COPY send_bytes.py .

# Unbuffered output so prints show immediately in Docker
CMD ["python", "-u", "send_bytes.py"]
