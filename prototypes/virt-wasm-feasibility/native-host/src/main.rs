use virt::connect::Connect;

fn main() {
    match Connect::open(Some("test:///default")) {
        Ok(mut connection) => {
            let close_result = connection.close();
            println!(
                "{{\"connection\":\"test:///default\",\"opened\":true,\"closed\":{}}}",
                close_result.is_ok()
            );
        }
        Err(error) => {
            eprintln!("failed to open test:///default: {error}");
            std::process::exit(1);
        }
    }
}
